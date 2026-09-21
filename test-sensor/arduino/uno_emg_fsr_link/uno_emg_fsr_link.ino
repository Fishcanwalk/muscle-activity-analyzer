#include <Arduino.h>
#include "board_config.h"

// Reads sEMG + FSR and forwards them to the ESP32 over UART, so the ESP32's
// workout firmware (esp32_workout_firmware.cpp) can spend its own ADC1 pins
// on nothing and dedicate the loop to WiFi/HTTP/LCD/buzzer duty instead. See
// PINS.md at the project root for the full wiring diagram (this link needs a
// voltage divider on the Uno->ESP32 direction; 5V logic into a 3.3V-only pin
// otherwise risks damaging the ESP32).
//
// This runs on the Uno's hardware Serial (pins 0/1) instead of SoftwareSerial
// on pins 2/3 -- which means USB and the ESP32 wire share the same pins.
// Don't have both connected at once (unplug USB before wiring pins 0/1 to the
// ESP32) and don't rely on the Arduino IDE Serial Monitor while the ESP32 is
// attached, since uploading also needs pins 0/1 free.
#define ESP32_LINK_BAUD 9600

// esp32_workout_firmware.cpp (and the web server behind it -- see
// `ADC_MAX = 4095` in telemetryStore.ts) was written assuming 12-bit ADC
// counts (0-4095), because that's what the ESP32's own analogRead() used to
// produce before this board took the job over. This Uno's ADC is only
// 10-bit (0-1023), so every raw reading gets rescaled up to that same
// 0-4095 range before it's sent -- otherwise the ESP32's FSR alert
// thresholds and the server's EMG/FSR calibration math would silently see a
// signal 1/4 the size they were tuned for.
const unsigned long SAMPLE_INTERVAL_MS = 10; // 100 Hz, matches the ESP32 firmware's fast-sample loop
unsigned long lastSampleMs = 0;

void setup() {
  Serial.begin(ESP32_LINK_BAUD);
  setupBoardAdc();
}

void loop() {
  unsigned long now = millis();
  if (now - lastSampleMs < SAMPLE_INTERVAL_MS) return;
  lastSampleMs = now;

  int emgRaw = analogRead(EMG_PIN);
  // FSR wiring reads high at rest and drops under force; invert first so a
  // bigger number always means "more force" (same convention the ESP32
  // firmware used to apply itself), then rescale both channels to 12-bit.
  int fsrInverted = ADC_MAX_VAL - analogRead(FSR_PIN);

  int emgScaled = map(emgRaw, 0, ADC_MAX_VAL, 0, 4095);
  int fsrScaled = map(fsrInverted, 0, ADC_MAX_VAL, 0, 4095);

  Serial.print(emgScaled);
  Serial.print(',');
  Serial.println(fsrScaled);
}
