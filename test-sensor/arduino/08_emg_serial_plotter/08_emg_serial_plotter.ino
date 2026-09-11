#include <Arduino.h>
#include "board_config.h"

// Attack/release smoothing factors for the envelope (0-1, higher = faster response).
// Fast attack so contractions show up immediately, slower release so the trace
// doesn't look like it's "draining" too abruptly when the muscle relaxes.
#define ENV_ATTACK  0.35f
#define ENV_RELEASE 0.03f

#define BASELINE_SAMPLES 200

int   baseline = 0;
float envelope = 0.0f;

void calibrateBaseline() {
  Serial.println("Calibrating baseline... keep the muscle RELAXED for 1 second.");
  long sum = 0;
  for (int i = 0; i < BASELINE_SAMPLES; i++) {
    sum += analogRead(EMG_PIN);
    delay(5);
  }
  baseline = sum / BASELINE_SAMPLES;
  B_PRINTF("Baseline = %d\n", baseline);
}

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  setupBoardAdc();
  calibrateBaseline();

  Serial.println("Open Tools > Serial Plotter now.");
  // Header line so Arduino IDE 2.x Serial Plotter labels each trace.
  Serial.println("Raw:0,Envelope:0");
}

void loop() {
  int raw = analogRead(EMG_PIN);
  int centered = raw - baseline;   // remove DC offset so the plot sits around 0
  int rectified = abs(centered);   // full-wave rectify

  // Exponential moving average with separate attack/release rates.
  float alpha = (rectified > envelope) ? ENV_ATTACK : ENV_RELEASE;
  envelope += alpha * ((float)rectified - envelope);

  Serial.print("Raw:");
  Serial.print(centered);
  Serial.print(",Envelope:");
  Serial.println(envelope);

  delay(2); // ~500 Hz sample rate for a smooth-looking waveform
}
