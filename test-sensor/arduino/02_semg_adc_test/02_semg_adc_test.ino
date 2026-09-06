#include <Arduino.h>
#include <math.h>
#include "board_config.h"

#define SAMPLE_WINDOW 200 // 200 samples window

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Serial.println("\n==========================================");
  B_PRINTF("  sEMG Sensor ADC Calibration Test\n");
  B_PRINTF("  Board: %s\n", BOARD_TYPE_NAME);
  B_PRINTF("  sEMG Pin: Pin %d | Max ADC: %d (%.1fV)\n", EMG_PIN, ADC_MAX_VAL, SYSTEM_VCC);
  Serial.println("==========================================");
  Serial.println("Instructions: Relax muscle first to view baseline noise,");
  Serial.println("then contract muscle to observe signal amplitude rise.\n");

  setupBoardAdc();
}

void loop() {
  uint32_t sum_squares = 0;
  int min_val = ADC_MAX_VAL + 1;
  int max_val = 0;
  int last_val = 0;

  for (int i = 0; i < SAMPLE_WINDOW; i++) {
    int val = analogRead(EMG_PIN);
    last_val = val;
    if (val < min_val) min_val = val;
    if (val > max_val) max_val = val;
    
    sum_squares += (val * val);
    delayMicroseconds(1000); // ~1kHz sampling rate
  }

  float rms = sqrt((float)sum_squares / SAMPLE_WINDOW);
  int peak_to_peak = max_val - min_val;
  float voltage = ((float)last_val / ADC_MAX_VAL) * SYSTEM_VCC;

  B_PRINTF("Raw:%d, RMS:%.1f, PeakToPeak:%d, Volt:%.2fV\n", 
           last_val, rms, peak_to_peak, voltage);
}
