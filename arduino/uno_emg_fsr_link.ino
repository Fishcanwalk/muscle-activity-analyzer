#include <Arduino.h>
#include <avr/interrupt.h>
#include <avr/sleep.h>
#include <avr/wdt.h>

volatile uint8_t eventFlags = 0;

#define ADC_CHANNEL_EMG 0
#define ADC_CHANNEL_FSR 1
#define ADC_MAX_VAL 1023

volatile int emgRawIsr = 0;
volatile int fsrRawIsr = 0;
volatile uint8_t currentAdcChannel = ADC_CHANNEL_EMG;

const int SAMPLE_RATE_HZ = 100;
#define wdt_timeout_2sec 7
#define TIMER1_OCR1A_VALUE ((F_CPU / 64UL / SAMPLE_RATE_HZ) - 1)

void setupSampleTimer() {
  cli();
  TCCR1A = 0;
  TCCR1B = 0;
  TCNT1 = 0;
  OCR1A = TIMER1_OCR1A_VALUE;
  TCCR1B |= (1 << WGM12);
  TCCR1B |= (1 << CS11) | (1 << CS10);
  TIMSK1 |= (1 << OCIE1A);
  sei();
}

ISR(TIMER1_COMPA_vect) {
  eventFlags |= (1 << 0);
}


ISR(ADC_vect) {
  int value = ADC;
  if (currentAdcChannel == ADC_CHANNEL_EMG) {
    emgRawIsr = value;
    eventFlags |= (1 << 1);
    currentAdcChannel = ADC_CHANNEL_FSR;
    ADMUX = (ADMUX & 0xF0) | (ADC_CHANNEL_FSR & 0x0F);
    ADCSRA |= (1 << ADSC);
  } else {
    fsrRawIsr = value;
    eventFlags |= (1 << 2);
  }
}


void WDT__enable(uint8_t timeout_v) {
  unsigned char bakSREG;
  uint8_t prescaler;
  prescaler = timeout_v & 0x07;
  prescaler |= (1 << WDE);
  if (timeout_v > 7) {
    prescaler |= (1 << WDP3);
  }
  bakSREG = SREG;
  cli();
  wdt_reset();
  WDTCSR |= ((1 << WDCE) | (1 << WDE));
  WDTCSR = prescaler;
  SREG = bakSREG;
}

void setup() {
  MCUSR = 0;
  wdt_disable();

  Serial.begin(9600);
  setupSampleTimer();
  ADMUX = (1 << REFS0) | ADC_CHANNEL_EMG;
  ADCSRA = (1 << ADEN) | (1 << ADIE) | (1 << ADPS2) | (1 << ADPS1) | (1 << ADPS0);
  DIDR0 |= (1 << ADC0D) | (1 << ADC1D);

  set_sleep_mode(SLEEP_MODE_IDLE);

  WDT__enable(wdt_timeout_2sec);
}

void loop() {
  sleep_mode();

  if (!(eventFlags & (1 << 0))) return;
  eventFlags &= ~(1 << 0);

  currentAdcChannel = ADC_CHANNEL_EMG;
  ADMUX = (ADMUX & 0xF0) | (ADC_CHANNEL_EMG & 0x0F);
  ADCSRA |= (1 << ADSC);

  while (!(eventFlags & (1 << 2))) sleep_mode();
  eventFlags &= ~((1 << 1) | (1 << 2));

  cli();
  int emgRaw = emgRawIsr;
  int fsrRaw = fsrRawIsr;
  sei();

  int fsrInverted = ADC_MAX_VAL - fsrRaw;
  int emgScaled = map(emgRaw, 0, ADC_MAX_VAL, 0, 4095);
  int fsrScaled = map(fsrInverted, 0, ADC_MAX_VAL, 0, 4095);

  Serial.print(emgScaled);
  Serial.print(',');
  Serial.println(fsrScaled);

  wdt_reset();
}
