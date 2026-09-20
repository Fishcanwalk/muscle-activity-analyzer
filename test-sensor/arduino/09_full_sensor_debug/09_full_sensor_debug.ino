// Standalone Arduino IDE debug sketch -- ESP32 only.
//
// Mirrors the sensor-fusion logic from src/esp32_connectToWifi_buttons.cpp
// (raw MPU6500 pitch/roll/velocity, MAX30102 HR + rough SpO2, MLX90614 skin
// temp delta, FSR stability, debounced buttons) but drops WiFi/HTTP and the
// LCD so it needs no backend server or extra wiring -- just open the Serial
// Monitor at 115200 baud and watch every sensor + button live. Use this when
// bench-testing hardware before wiring up the full telemetry firmware.
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include "MAX30105.h"
#include "heartRate.h"
#include "board_config.h"

// Same wiring as the production firmware -- see PINS.md at the project root.
#define BUTTON_A_PIN 32
#define BUTTON_B_PIN 33
#define BUTTON_DEBOUNCE_MS 250 // ignores contact bounce / accidental double-taps

// Buzzer: sounds while FSR force sits in the (100, 300) ADC-count band -- see
// FSR_BUZZER_LOW_THRESHOLD/FSR_BUZZER_HIGH_THRESHOLD below.
#define BUZZER_PIN 25
const int FSR_BUZZER_LOW_THRESHOLD = 100;   // ADC counts (0-4095); below this = no alert
const int FSR_BUZZER_HIGH_THRESHOLD = 300;  // ADC counts; at/above this = no alert
const float FSR_STABILITY_ALERT_THRESHOLD = 70.0f; // % from computeFsrStability(); below this = "not steady"
const unsigned long BUZZER_BEEP_INTERVAL_MS = 150; // on/off toggle period while alerting
const unsigned long BUZZER_ALERT_DELAY_MS = 3000;  // must stay flagged this long before it sounds
bool buzzerOn = false;
unsigned long buzzerLastToggleMs = 0;
unsigned long fsrAlertConditionSinceMs = 0; // 0 = condition not currently met

bool buttonALastLevel = false;
bool buttonBLastLevel = false;
unsigned long buttonALastEdgeMs = 0;
unsigned long buttonBLastEdgeMs = 0;

// MPU6050/6500-compatible raw driver.
// Adafruit_MPU6050 hard-rejects any chip whose WHO_AM_I isn't exactly 0x68, but
// this board's module is actually an MPU6500 (WHO_AM_I 0x70) -- register-compatible
// with the MPU6050 for everything used here, so we talk to it directly instead.
#define MPU_ADDR             0x68
#define MPU_REG_WHO_AM_I     0x75
#define MPU_REG_PWR_MGMT_1   0x6B
#define MPU_REG_GYRO_CONFIG  0x1B
#define MPU_REG_ACCEL_CONFIG 0x1C
#define MPU_REG_ACCEL_XOUT_H 0x3B

uint8_t mpuReadReg(uint8_t reg) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)1);
  return Wire.available() ? Wire.read() : 0xFF;
}

void mpuWriteReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

bool mpuBegin() {
  uint8_t whoami = mpuReadReg(MPU_REG_WHO_AM_I);
  B_PRINTF("[DEBUG] MPU WHO_AM_I = 0x%02X (0x68=MPU6050, 0x70=MPU6500)\n", whoami);
  if (whoami != 0x68 && whoami != 0x70) return false;

  mpuWriteReg(MPU_REG_PWR_MGMT_1, 0x01);   // wake up, PLL w/ X-axis gyro ref
  delay(10);
  mpuWriteReg(MPU_REG_GYRO_CONFIG, 0x08);  // +/-500 dps
  mpuWriteReg(MPU_REG_ACCEL_CONFIG, 0x10); // +/-8g
  return true;
}

void mpuReadAccelMs2(float &ax, float &ay, float &az) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(MPU_REG_ACCEL_XOUT_H);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)6);
  int16_t rawX = (Wire.read() << 8) | Wire.read();
  int16_t rawY = (Wire.read() << 8) | Wire.read();
  int16_t rawZ = (Wire.read() << 8) | Wire.read();
  const float g_to_ms2 = 9.80665f;
  ax = (rawX / 4096.0f) * g_to_ms2; // +/-8g range -> 4096 LSB/g
  ay = (rawY / 4096.0f) * g_to_ms2;
  az = (rawZ / 4096.0f) * g_to_ms2;
}

MAX30105          max30102;
Adafruit_MLX90614 mlx;

bool statusMpu = false;
bool statusMax = false;
bool statusMlx = false;

const unsigned long SAMPLE_INTERVAL_MS = 10;  // 100 Hz local sensor sampling
const unsigned long PRINT_INTERVAL_MS  = 300; // ~3 Hz debug summary line
unsigned long lastSampleMs = 0;
unsigned long lastPrintMs = 0;
int fsrLatest = 0;
int emgLatest = 0;

const float GRAVITY_MSS = 9.80665f;
const float VELOCITY_DECAY = 0.98f; // bleeds off drift each sample
float velocity = 0.0f, mpuPitch = 0.0f, mpuRoll = 0.0f;
float mpuAx = 0.0f, mpuAy = 0.0f, mpuAz = 0.0f;
unsigned long lastMpuMicros = 0;

const byte RATE_SIZE = 4;
byte bpmRates[RATE_SIZE];
byte bpmRateSpot = 0;
long lastBeat = 0;
int beatAvg = 0;
const long FINGER_PRESENT_IR_THRESHOLD = 50000;

// Rough SpO2 estimate from a rolling Red/IR AC-DC ratio window.
// Approximate empirical calibration (SpO2 ~= 110 - 25*R); not clinically accurate.
const int SPO2_WINDOW_SAMPLES = 200; // ~2s at the 100Hz fast-sample rate
int spo2SampleCount = 0;
long irMin = 0, irMax = 0, redMin = 0, redMax = 0;
float spo2Estimate = 98.0f;

float skinTempBaseline = 0.0f;

const int FSR_WINDOW_SAMPLES = 20;
int fsrHistory[FSR_WINDOW_SAMPLES];
int fsrHistoryIdx = 0;
bool fsrHistoryFull = false;

void updateFsrStability(int fsrVal) {
  fsrHistory[fsrHistoryIdx] = fsrVal;
  fsrHistoryIdx = (fsrHistoryIdx + 1) % FSR_WINDOW_SAMPLES;
  if (fsrHistoryIdx == 0) fsrHistoryFull = true;
}

float computeFsrStability() {
  int count = fsrHistoryFull ? FSR_WINDOW_SAMPLES : fsrHistoryIdx;
  if (count < 2) return 100.0f;

  int lo = fsrHistory[0], hi = fsrHistory[0];
  for (int i = 1; i < count; i++) {
    lo = min(lo, fsrHistory[i]);
    hi = max(hi, fsrHistory[i]);
  }

  // A ~200-count ADC swing is treated as fully "unstable" (0%); tune to taste.
  float range = hi - lo;
  float stability = 100.0f - (range / 200.0f) * 100.0f;
  return constrain(stability, 0.0f, 100.0f);
}

// Beeps in a non-blocking on/off pattern once the FSR reading has sat in the
// "weak grip" band (FSR_BUZZER_LOW_THRESHOLD..FSR_BUZZER_HIGH_THRESHOLD) OR
// the grip has been unsteady (stability below FSR_STABILITY_ALERT_THRESHOLD)
// for at least BUZZER_ALERT_DELAY_MS -- clearing both conditions at any point
// resets the wait so a brief blip doesn't trigger it.
void updateBuzzer(unsigned long now) {
  bool weakForce = fsrLatest > FSR_BUZZER_LOW_THRESHOLD && fsrLatest < FSR_BUZZER_HIGH_THRESHOLD;
  bool unsteady = computeFsrStability() < FSR_STABILITY_ALERT_THRESHOLD;
  bool conditionMet = weakForce || unsteady;

  if (!conditionMet) {
    fsrAlertConditionSinceMs = 0;
  } else if (fsrAlertConditionSinceMs == 0) {
    fsrAlertConditionSinceMs = now;
  }

  bool shouldAlert = conditionMet && fsrAlertConditionSinceMs != 0 && (now - fsrAlertConditionSinceMs) >= BUZZER_ALERT_DELAY_MS;
  if (!shouldAlert) {
    if (buzzerOn) {
      buzzerOn = false;
      digitalWrite(BUZZER_PIN, LOW);
    }
    return;
  }

  if (now - buzzerLastToggleMs >= BUZZER_BEEP_INTERVAL_MS) {
    buzzerLastToggleMs = now;
    buzzerOn = !buzzerOn;
    digitalWrite(BUZZER_PIN, buzzerOn ? HIGH : LOW);
  }
}

// Detects a HIGH->LOW (pressed) transition, ignoring further edges for
// BUTTON_DEBOUNCE_MS to filter contact bounce. Prints immediately on a clean
// press so button wiring can be verified without waiting for the summary line.
void pollButtonEdge(const char *label, int pin, bool &lastLevel, unsigned long &lastEdgeMs, unsigned long now) {
  bool level = (digitalRead(pin) == LOW);
  if (level && !lastLevel && (now - lastEdgeMs) >= BUTTON_DEBOUNCE_MS) {
    B_PRINTF(">>> Button %s pressed\n", label);
    lastEdgeMs = now;
  }
  lastLevel = level;
}

void updateSpo2Window(long irValue, long redValue) {
  if (spo2SampleCount == 0) {
    irMin = irMax = irValue;
    redMin = redMax = redValue;
  } else {
    irMin = min(irMin, irValue);
    irMax = max(irMax, irValue);
    redMin = min(redMin, redValue);
    redMax = max(redMax, redValue);
  }
  spo2SampleCount++;

  if (spo2SampleCount >= SPO2_WINDOW_SAMPLES) {
    float irAc = irMax - irMin, irDc = (irMax + irMin) / 2.0f;
    float redAc = redMax - redMin, redDc = (redMax + redMin) / 2.0f;

    if (irDc > 0 && redDc > 0 && irAc > 0) {
      float ratio = (redAc / redDc) / (irAc / irDc);
      spo2Estimate = constrain(110.0f - 25.0f * ratio, 70.0f, 100.0f);
    }
    spo2SampleCount = 0;
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  pinMode(BUTTON_A_PIN, INPUT_PULLUP);
  pinMode(BUTTON_B_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  Serial.println("\n========================================================");
  B_PRINTF("  Muscle Activity Analyzer - FULL SENSOR DEBUG (no WiFi/LCD)\n");
  B_PRINTF("  Target Board: %s\n", BOARD_TYPE_NAME);
  Serial.println("========================================================");

  setupBoardAdc();
  B_PRINTF("[ADC] sEMG: Pin %d | FSR: Pin %d (Max: %d)\n", EMG_PIN, FSR_PIN, ADC_MAX_VAL);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(50000); // conservative bus speed for breadboard/long-wire I2C
  B_PRINTF("[I2C] Initialized on SDA=%d, SCL=%d\n", I2C_SDA_PIN, I2C_SCL_PIN);

  // A device can ACK a bare address (Wire.beginTransmission/endTransmission) but still
  // fail a real register read on first attempt right after power-up; retry a few times
  // with a short settle delay before giving up.
  for (int attempt = 0; attempt < 5 && !statusMpu; attempt++) {
    if (attempt > 0) delay(100);
    statusMpu = mpuBegin();
  }
  Serial.println(statusMpu ? " [1/3] MPU-6050/6500 (0x68) -> OK"
                            : " [1/3] MPU-6050/6500 (0x68) -> FAILED (pitch/roll/velocity will read 0)");
  lastMpuMicros = micros();

  for (int attempt = 0; attempt < 5 && !statusMax; attempt++) {
    if (attempt > 0) delay(100);
    statusMax = max30102.begin(Wire, I2C_SPEED_FAST);
  }
  if (statusMax) {
    max30102.setup();
    max30102.setPulseAmplitudeRed(0x0A);
    max30102.setPulseAmplitudeGreen(0);
    Serial.println(" [2/3] MAX30102       (0x57) -> OK");
  } else {
    Serial.println(" [2/3] MAX30102       (0x57) -> FAILED (hr/spo2 will read 0)");
  }

  // max30102.begin() forces the bus to I2C_SPEED_FAST (400kHz) internally, clobbering
  // the conservative Wire.setClock() above. MLX90614 is only rated to 100kHz (SMBus
  // standard mode), so re-lower the clock before touching it or its PEC/CRC checks fail.
  Wire.setClock(50000);

  for (int attempt = 0; attempt < 5 && !statusMlx; attempt++) {
    if (attempt > 0) delay(100);
    statusMlx = mlx.begin(0x5A, &Wire);
  }
  if (statusMlx) {
    skinTempBaseline = mlx.readObjectTempC();
    Serial.println(" [3/3] MLX90614       (0x5A) -> OK");
  } else {
    Serial.println(" [3/3] MLX90614       (0x5A) -> FAILED (skinTemp/deltaTemp will read 0)");
  }

  for (int i = 0; i < FSR_WINDOW_SAMPLES; i++) fsrHistory[i] = 0;

  Serial.println("--------------------------------------------------------");
  Serial.println("Starting continuous live readings... (press Button A/B to test wiring)\n");
}

void loop() {
  unsigned long now = millis();

  if (now - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = now;

    pollButtonEdge("A", BUTTON_A_PIN, buttonALastLevel, buttonALastEdgeMs, now);
    pollButtonEdge("B", BUTTON_B_PIN, buttonBLastLevel, buttonBLastEdgeMs, now);

    emgLatest = analogRead(EMG_PIN);
    // FSR wiring reads high (near ADC_MAX_VAL) at rest and drops as force is
    // applied; invert so higher ADC = more force, matching the physical sensor.
    fsrLatest = ADC_MAX_VAL - analogRead(FSR_PIN);
    updateFsrStability(fsrLatest);
    updateBuzzer(now);

    if (statusMpu) {
      mpuReadAccelMs2(mpuAx, mpuAy, mpuAz);
      mpuPitch = atan2(mpuAy, sqrt(mpuAx * mpuAx + mpuAz * mpuAz)) * 180.0 / PI;
      mpuRoll = atan2(-mpuAx, mpuAz) * 180.0 / PI;

      unsigned long nowMicros = micros();
      float dt = (nowMicros - lastMpuMicros) / 1000000.0f;
      lastMpuMicros = nowMicros;

      float netAccel = mpuAz - GRAVITY_MSS;
      velocity = (velocity + netAccel * dt) * VELOCITY_DECAY;
    }

    if (statusMax) {
      long irValue = max30102.getIR();
      long redValue = max30102.getRed();

      if (irValue > FINGER_PRESENT_IR_THRESHOLD) {
        if (checkForBeat(irValue)) {
          long delta = millis() - lastBeat;
          lastBeat = millis();
          float bpm = 60.0f / (delta / 1000.0f);
          if (bpm > 20 && bpm < 255) {
            bpmRates[bpmRateSpot++] = (byte)bpm;
            bpmRateSpot %= RATE_SIZE;
            long sum = 0;
            for (byte i = 0; i < RATE_SIZE; i++) sum += bpmRates[i];
            beatAvg = sum / RATE_SIZE;
          }
        }
        updateSpo2Window(irValue, redValue);
      } else {
        beatAvg = 0; // no finger on sensor
      }
    }
  }

  if (now - lastPrintMs >= PRINT_INTERVAL_MS) {
    lastPrintMs = now;

    float skinTemp = 0, deltaTemp = 0;
    if (statusMlx) {
      skinTemp = mlx.readObjectTempC();
      deltaTemp = skinTemp - skinTempBaseline;
    }
    float fsrStability = computeFsrStability();

    B_PRINTF("| EMG:%4d | FSR:%4d (%3.0f%% stable) | Pitch:%6.1f Roll:%6.1f V:%6.3fm/s | HR:%3dbpm SpO2:%5.1f%% | Skin:%5.1fC (d%+.1f) | BtnA:%s BtnB:%s |\n",
             emgLatest, fsrLatest, fsrStability,
             mpuPitch, mpuRoll, velocity,
             beatAvg, spo2Estimate,
             skinTemp, deltaTemp,
             buttonALastLevel ? "DOWN" : "up  ",
             buttonBLastLevel ? "DOWN" : "up  ");
  }

  delay(1); // yield to background tasks
}
