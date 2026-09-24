#include <Arduino.h>
#include <avr/interrupt.h>
#include <avr/sleep.h>
#include <avr/wdt.h>
#include "board_config.h"

// Reads sEMG + FSR and forwards them to the ESP32 over UART, so the ESP32's
// workout firmware (esp32_workout_firmware.cpp) can spend its own ADC1 pins
// on nothing else. See PINS.md for the wiring diagram (needs a voltage
// divider on the Uno->ESP32 direction; 5V into a 3.3V-only pin risks damage).
//
// Runs on hardware Serial (pins 0/1), not SoftwareSerial -- so USB and the
// ESP32 wire share the same pins. Don't have both connected at once.
#define ESP32_LINK_BAUD 9600

// ATmega328P (2KB RAM) can't run FreeRTOS in practice, so this uses AVR's own
// native APIs for the same 4 embedded mechanisms as the ESP32 side: a
// hardware timer (Timer1 CTC) for the 100Hz cadence, interrupt-driven ADC
// sampling, the AVR watchdog, and CPU sleep between samples. Same
// bitmask-flag style (set in ISRs, cleared in loop()) as the ESP32 file.
#define FLAG_TIMER_TICK (1 << 0) // Timer1 Compare Match A -- a new 10ms sampling cycle started
#define FLAG_EMG_READY  (1 << 1) // ADC conversion complete for the EMG channel
#define FLAG_FSR_READY  (1 << 2) // ADC conversion complete for the FSR channel
volatile uint8_t eventFlags = 0;

// Raw ADC channel numbers (not the EMG_PIN/FSR_PIN Arduino pin macros) --
// ADMUX wants the bare channel index. A0->0, A1->1 on this board; update
// these if board_config.h ever moves the sensors to different pins.
#define ADC_CHANNEL_EMG 0
#define ADC_CHANNEL_FSR 1

volatile int emgRawIsr = 0;
volatile int fsrRawIsr = 0;
volatile uint8_t currentAdcChannel = ADC_CHANNEL_EMG;

const int SAMPLE_RATE_HZ = 100; // matches the ESP32 firmware's fast-sample loop

// Timer1, CTC mode: counts to OCR1A at F_CPU/64, resets, fires
// TIMER1_COMPA_vect -- replaces the old millis() gate with a real
// hardware timer/counter, and its interrupt wakes the CPU from sleep.
#define TIMER1_OCR1A_VALUE ((F_CPU / 64UL / SAMPLE_RATE_HZ) - 1) // 16MHz/64/100Hz - 1 = 2499

void setupSampleTimer() {
  cli();
  TCCR1A = 0;
  TCCR1B = 0;
  TCNT1 = 0;
  OCR1A = TIMER1_OCR1A_VALUE;
  TCCR1B |= (1 << WGM12);              // CTC mode
  TCCR1B |= (1 << CS11) | (1 << CS10); // prescaler = 64
  TIMSK1 |= (1 << OCIE1A);             // enable Timer1 Compare Match A interrupt
  sei();
}

ISR(TIMER1_COMPA_vect) {
  eventFlags |= FLAG_TIMER_TICK;
}

// analogRead() busy-waits ~104us per call with the CPU fully awake. Starting
// a conversion and letting ADC_vect fire on completion lets the CPU sleep
// during that wait instead -- lower power, and quieter analog readings since
// digital switching noise drops while the CPU is idle.
void setupAdc() {
  ADMUX = (1 << REFS0) | ADC_CHANNEL_EMG; // AVcc (5V) reference, start on the EMG channel
  ADCSRA = (1 << ADEN) | (1 << ADIE) |    // enable ADC + ADC-complete interrupt
           (1 << ADPS2) | (1 << ADPS1) | (1 << ADPS0); // /128 prescaler -> ~125kHz ADC clock
  DIDR0 |= (1 << ADC0D) | (1 << ADC1D);   // disable digital input buffers on A0/A1 (lower noise/power)
}

void startAdcConversion(uint8_t channel) {
  currentAdcChannel = channel;
  ADMUX = (ADMUX & 0xF0) | (channel & 0x0F); // low nibble = MUX3:0 channel select
  ADCSRA |= (1 << ADSC);                     // start conversion
}

ISR(ADC_vect) {
  int value = ADC; // ADCL is read before ADCH automatically via this 16-bit macro
  if (currentAdcChannel == ADC_CHANNEL_EMG) {
    emgRawIsr = value;
    eventFlags |= FLAG_EMG_READY;
    startAdcConversion(ADC_CHANNEL_FSR); // chain straight into the FSR channel, same cycle
  } else {
    fsrRawIsr = value;
    eventFlags |= FLAG_FSR_READY;
  }
}

void setup() {
  // Clear the reset-cause register and disable the watchdog first -- if a
  // prior watchdog reset left WDRF set and the bootloader doesn't clear it
  // (an old AVR bootloader footgun), wdt_enable() below could reboot-loop.
  MCUSR = 0;
  wdt_disable();

  Serial.begin(ESP32_LINK_BAUD);
  setupBoardAdc(); // from board_config.h -- no-op on AVR, kept for symmetry with the ESP32 build
  setupSampleTimer();
  setupAdc();

  // Lightest sleep mode: keeps Timer1 and the ADC able to wake the CPU.
  // A deeper mode would stop the peripherals this firmware depends on.
  set_sleep_mode(SLEEP_MODE_IDLE);

  wdt_enable(WDTO_2S); // reset the chip if a full sample cycle doesn't complete within 2s
}

void loop() {
  // Sleep until the next interrupt (timer tick or ADC done) instead of
  // busy-polling a flag/millis().
  sleep_mode();

  if (!(eventFlags & FLAG_TIMER_TICK)) return; // spurious/ADC-only wakeup -- nothing to do yet
  eventFlags &= ~FLAG_TIMER_TICK;

  startAdcConversion(ADC_CHANNEL_EMG); // kicks off this cycle's EMG -> FSR conversion chain

  while (!(eventFlags & FLAG_FSR_READY)) sleep_mode(); // sleep between conversions, woken by ADC_vect
  eventFlags &= ~(FLAG_EMG_READY | FLAG_FSR_READY);

  cli();
  int emgRaw = emgRawIsr;
  int fsrRaw = fsrRawIsr;
  sei();

  // The ESP32 firmware / backend assume 12-bit ADC counts (0-4095), so every
  // reading gets rescaled up from this board's 10-bit ADC (0-1023). FSR reads
  // high at rest and drops under force, so invert it first (bigger = more force).
  int fsrInverted = ADC_MAX_VAL - fsrRaw;
  int emgScaled = map(emgRaw, 0, ADC_MAX_VAL, 0, 4095);
  int fsrScaled = map(fsrInverted, 0, ADC_MAX_VAL, 0, 4095);

  Serial.print(emgScaled);
  Serial.print(',');
  Serial.println(fsrScaled);

  wdt_reset(); // fed once per completed sample cycle
}
