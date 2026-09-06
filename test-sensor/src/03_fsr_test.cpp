#include <Arduino.h>
#include "board_config.h"

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Serial.println("\n==========================================");
  B_PRINTF("  FSR (Force Sensitive Resistor) Test\n");
  B_PRINTF("  Board: %s\n", BOARD_TYPE_NAME);
  B_PRINTF("  FSR Pin: Pin %d | Max ADC: %d (%.1fV)\n", FSR_PIN, ADC_MAX_VAL, SYSTEM_VCC);
  Serial.println("==========================================");
  Serial.println("Press the FSR sensor to see ADC value and estimated force.\n");

  setupBoardAdc();
}

void loop() {
  int raw_adc = analogRead(FSR_PIN);
  float voltage = ((float)raw_adc / ADC_MAX_VAL) * SYSTEM_VCC;

  // Normalized threshold based on ADC_MAX_VAL
  float ratio = (float)raw_adc / ADC_MAX_VAL;
  String force_level = "None";
  if (ratio > 0.75f) {
    force_level = "Heavy Force";
  } else if (ratio > 0.35f) {
    force_level = "Medium Force";
  } else if (ratio > 0.08f) {
    force_level = "Light Touch";
  }

  B_PRINTF("Raw_ADC:%d (/%d), Voltage:%.2fV, Level:%s\n", 
           raw_adc, ADC_MAX_VAL, voltage, force_level.c_str());

  delay(100);
}
