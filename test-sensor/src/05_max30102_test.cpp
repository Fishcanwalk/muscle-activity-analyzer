#include <Arduino.h>
#include <Wire.h>
#include "MAX30105.h"
#include "heartRate.h"
#include "board_config.h"

MAX30105 particleSensor;

const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute = 0;
int beatAvg = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Serial.println("\n==========================================");
  B_PRINTF("  MAX30102 Heart Rate Sensor Test\n");
  B_PRINTF("  Board: %s\n", BOARD_TYPE_NAME);
  Serial.println("==========================================");

#if defined(ESP32) || defined(ESP8266)
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
#else
  Wire.begin();
#endif

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("❌ MAX30102 was not found at 0x57. Please check wiring/power.");
    while (1) delay(100);
  }
  Serial.println("✅ MAX30102 Found and Initialized successfully!");

  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);
  particleSensor.setPulseAmplitudeGreen(0);
}

void loop() {
  long irValue = particleSensor.getIR();

  if (irValue < 50000) {
    B_PRINTF("IR: %ld | [No finger detected - Place finger on sensor]\n", irValue);
    delay(500);
    return;
  }

  if (checkForBeat(irValue) == true) {
    long delta = millis() - lastBeat;
    lastBeat = millis();

    beatsPerMinute = 60.0f / (delta / 1000.0f);

    if (beatsPerMinute < 255 && beatsPerMinute > 20) {
      rates[rateSpot++] = (byte)beatsPerMinute;
      rateSpot %= RATE_SIZE;

      beatAvg = 0;
      for (byte x = 0; x < RATE_SIZE; x++) beatAvg += rates[x];
      beatAvg /= RATE_SIZE;
    }
  }

  long redValue = particleSensor.getRed();
  B_PRINTF("IR: %ld, Red: %ld, Instant_BPM: %.1f, Avg_BPM: %d\n", 
           irValue, redValue, beatsPerMinute, beatAvg);
  delay(50);
}
