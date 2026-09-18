#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include "MAX30105.h"
#include "heartRate.h"
#include <LiquidCrystal_I2C.h>
#include "board_config.h"

// Two push-buttons, wired to GND with internal pull-up (pressed = LOW).
// See PINS.md at the project root for the wiring diagram.
// Button A drives the web app's Start/Stop-set toggle (and "start next set" on
// the 3rd press); Button B stops the current set (if running) and saves the
// session -- see workout.svelte.ts `handleRemoteButton()` on the frontend.
#define BUTTON_A_PIN 32
#define BUTTON_B_PIN 33
#define BUTTON_DEBOUNCE_MS 250 // ignores contact bounce / accidental double-taps

bool buttonAPressed = false;
bool buttonBPressed = false;
bool buttonALastLevel = false; // debounced level from the previous fast-sample tick
bool buttonBLastLevel = false;
unsigned long buttonALastEdgeMs = 0;
unsigned long buttonBLastEdgeMs = 0;
bool buttonAEvent = false; // latched "pressed since last network send", cleared after POST
bool buttonBEvent = false;

// 16x2 I2C LCD, same I2C bus as the MPU/MAX30102/MLX90614 (SDA=21, SCL=22).
// 0x27 is the common PCF8574 backpack address; run the 01_i2c_scanner sketch
// and change this if your module shows up at 0x3F instead.
#define LCD_I2C_ADDR 0x27
#define LCD_COLS     16
#define LCD_ROWS     2
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS);

// Local rep count shown on the LCD -- separate from the buttons above and from
// the web app's rep counter (camera-driven); nothing increments this yet.
int repCount = 0;

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

// ----------------------------------------------------
// ข้อมูลสำหรับล็อกอิน CoEIoT (WPA2-Personal)
// ----------------------------------------------------
const char* ssid     = "CoEIoT";
const char* password = "iot.coe.psu.ac.th";

// IP คอมพิวเตอร์ของคุณ (ดูจากคำสั่ง hostname -I บนคอม)
const char* serverUrl = "http://172.30.95.53:5173/api/telemetry";

// ----------------------------------------------------
// Sensor objects (see docs/sensor_usage.md for the 6-sensor fusion design)
// ----------------------------------------------------
MAX30105          max30102;
Adafruit_MLX90614 mlx;

bool statusMpu = false;
bool statusMax = false;
bool statusMlx = false;

// ----------------------------------------------------
// Timing: sample sensors fast (for waveform fidelity / integration accuracy),
// but only POST to the web API at a lower rate to cut WiFi/HTTP overhead.
// ----------------------------------------------------
const unsigned long SAMPLE_INTERVAL_MS = 10;  // 100 Hz local sensor sampling
const unsigned long SEND_INTERVAL_MS   = 100; // 10 Hz network send (was 20 Hz/50ms)
const int EMG_BATCH_CAPACITY = (SEND_INTERVAL_MS / SAMPLE_INTERVAL_MS) + 2; // small margin for jitter
int emgBatch[EMG_BATCH_CAPACITY];
int emgBatchCount = 0;
int fsrLatest = 0;
unsigned long lastSampleMs = 0;
unsigned long lastSendMs = 0;

const unsigned long LCD_UPDATE_INTERVAL_MS = 200; // 5 Hz -- plenty for a human-readable display
unsigned long lastLcdMs = 0;

// MPU-6050: pitch/roll + concentric velocity via leaky-integrated vertical
// acceleration, updated every fast sample for accurate dt. This is a simplified
// VBT estimate (no zero-velocity-update / Kalman filter), good enough for
// relative rep-to-rep comparison, not lab-grade accuracy.
const float GRAVITY_MSS = 9.80665f;
const float VELOCITY_DECAY = 0.98f; // bleeds off drift each sample
float velocity = 0.0f, mpuPitch = 0.0f, mpuRoll = 0.0f;
float mpuAx = 0.0f, mpuAy = 0.0f, mpuAz = 0.0f;
unsigned long lastMpuMicros = 0;

// MAX30102: beat detection -> BPM (same approach as 05_max30102_test.cpp)
const byte RATE_SIZE = 4;
byte bpmRates[RATE_SIZE];
byte bpmRateSpot = 0;
long lastBeat = 0;
int beatAvg = 0;
const long FINGER_PRESENT_IR_THRESHOLD = 50000;

// MAX30102: rough SpO2 estimate from a rolling Red/IR AC-DC ratio window.
// Approximate empirical calibration (SpO2 ~= 110 - 25*R); not clinically accurate.
const int SPO2_WINDOW_SAMPLES = 200; // ~2s at the 100Hz fast-sample rate
int spo2SampleCount = 0;
long irMin = 0, irMax = 0, redMin = 0, redMax = 0;
float spo2Estimate = 98.0f;

// MLX90614: report temperature delta vs. the skin temp measured at boot
float skinTempBaseline = 0.0f;

// FSR: grip stability (%) from the range of readings over a short rolling window
const int FSR_WINDOW_SAMPLES = 20;
int fsrHistory[FSR_WINDOW_SAMPLES];
int fsrHistoryIdx = 0;
bool fsrHistoryFull = false;

void connectWiFi() {
  Serial.println("\n[WiFi] Setting up connection for CoEIoT...");

  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("[WiFi] Connecting to CoEIoT");
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 40) {
    delay(500);
    Serial.print(".");
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] ✅ Connected to CoEIoT successfully!");
    Serial.print("[WiFi] ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] ❌ Failed to connect to CoEIoT. Please verify credentials.");
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(BUTTON_A_PIN, INPUT_PULLUP);
  pinMode(BUTTON_B_PIN, INPUT_PULLUP);

  setupBoardAdc();
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000); // conservative bus speed for breadboard/long-wire I2C

  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Booting...");

  // A device can ACK a bare address (Wire.beginTransmission/endTransmission) but still
  // fail a real register read on first attempt right after power-up; retry a few times
  // with a short settle delay before giving up.
  for (int attempt = 0; attempt < 5 && !statusMpu; attempt++) {
    if (attempt > 0) delay(100);
    statusMpu = mpuBegin();
  }
  if (statusMpu) {
    Serial.println("[I2C] MPU-6050/6500  (0x68) -> OK");
  } else {
    Serial.println("[I2C] MPU-6050/6500  (0x68) -> FAILED (velocity/pitch/roll will read 0)");
  }
  lastMpuMicros = micros();

  for (int attempt = 0; attempt < 5 && !statusMax; attempt++) {
    if (attempt > 0) delay(100);
    statusMax = max30102.begin(Wire, I2C_SPEED_FAST);
  }
  if (statusMax) {
    max30102.setup();
    max30102.setPulseAmplitudeRed(0x0A);
    max30102.setPulseAmplitudeGreen(0);
    Serial.println("[I2C] MAX30102  (0x57) -> OK");
  } else {
    Serial.println("[I2C] MAX30102  (0x57) -> FAILED (hr/spo2 will read 0)");
  }

  for (int attempt = 0; attempt < 5 && !statusMlx; attempt++) {
    if (attempt > 0) delay(100);
    statusMlx = mlx.begin(0x5A, &Wire);
  }
  if (statusMlx) {
    skinTempBaseline = mlx.readObjectTempC();
    Serial.println("[I2C] MLX90614  (0x5A) -> OK");
  } else {
    Serial.println("[I2C] MLX90614  (0x5A) -> FAILED (skinTemp/deltaTemp will read 0)");
  }

  for (int i = 0; i < FSR_WINDOW_SAMPLES; i++) fsrHistory[i] = 0;

  connectWiFi();
}

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

// Detects a HIGH->LOW (pressed) transition, ignoring further edges for
// BUTTON_DEBOUNCE_MS to filter contact bounce. Sets `eventFlag` true on a
// clean press; the caller latches it until the next network send.
void pollButtonEdge(int pin, bool &lastLevel, unsigned long &lastEdgeMs, bool &eventFlag, unsigned long now) {
  bool level = (digitalRead(pin) == LOW);
  if (level && !lastLevel && (now - lastEdgeMs) >= BUTTON_DEBOUNCE_MS) {
    eventFlag = true;
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

// Line 1: rep count (the value this file exists to show).
// Line 2: concentric velocity (m/s, VBT) + heart rate (bpm) -- the two numbers
// most relevant to "how was that rep" while a set is in progress.
void updateLcd() {
  char line1[LCD_COLS + 1];
  char line2[LCD_COLS + 1];
  snprintf(line1, sizeof(line1), "REP:%d", repCount);
  snprintf(line2, sizeof(line2), "V:%.2f HR:%d", velocity, beatAvg);

  lcd.setCursor(0, 0);
  lcd.print(line1);
  for (int i = strlen(line1); i < LCD_COLS; i++) lcd.print(' ');

  lcd.setCursor(0, 1);
  lcd.print(line2);
  for (int i = strlen(line2); i < LCD_COLS; i++) lcd.print(' ');
}

void loop() {
  unsigned long now = millis();

  // ---- Fast local sampling (100 Hz): EMG waveform fidelity, accurate MPU dt
  // integration, FSR stability window, and MAX30102 beat detection all need
  // frequent polling even though we only POST to the API at a lower rate. ----
  if (now - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = now;

    // Buttons: debounced press-edge detection; events latch until the next send.
    pollButtonEdge(BUTTON_A_PIN, buttonALastLevel, buttonALastEdgeMs, buttonAEvent, now);
    pollButtonEdge(BUTTON_B_PIN, buttonBLastLevel, buttonBLastEdgeMs, buttonBEvent, now);
    buttonAPressed = buttonALastLevel;
    buttonBPressed = buttonBLastLevel;

    // sEMG + FSR (raw ADC counts; server converts to µV / N, see telemetryStore.ts)
    int emgVal = analogRead(EMG_PIN);
    fsrLatest = analogRead(FSR_PIN);
    updateFsrStability(fsrLatest);
    if (emgBatchCount < EMG_BATCH_CAPACITY) emgBatch[emgBatchCount++] = emgVal;

    // MPU-6050/6500: pitch/roll + leaky-integrated concentric velocity
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

    // MAX30102: heart rate (BPM) + rough SpO2 estimate
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

  // ---- LCD refresh (5 Hz): independent of the network send rate so the
  // display keeps updating even if WiFi/the API is down. ----
  if (now - lastLcdMs >= LCD_UPDATE_INTERVAL_MS) {
    lastLcdMs = now;
    updateLcd();
  }

  // ---- Slow network send (10 Hz): batch every EMG sample collected since the
  // last send so no signal is lost even though we POST less often. ----
  if (WiFi.status() == WL_CONNECTED && now - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = now;

    // MLX90614 changes slowly -- only worth reading once per network send.
    float skinTemp = 0, deltaTemp = 0;
    if (statusMlx) {
      skinTemp = mlx.readObjectTempC();
      deltaTemp = skinTemp - skinTempBaseline;
    }

    float fsrStability = computeFsrStability();

    char emgArray[96];
    int pos = snprintf(emgArray, sizeof(emgArray), "[");
    for (int i = 0; i < emgBatchCount; i++) {
      pos += snprintf(emgArray + pos, sizeof(emgArray) - pos, "%s%d", i == 0 ? "" : ",", emgBatch[i]);
    }
    snprintf(emgArray + pos, sizeof(emgArray) - pos, "]");
    int sentBatchSize = emgBatchCount;
    emgBatchCount = 0;

    // Sent only for the one cycle right after a press, then cleared -- the
    // server treats a `true` here as a discrete "button was pressed" event,
    // not a held-down level.
    bool sentButtonA = buttonAEvent;
    bool sentButtonB = buttonBEvent;
    buttonAEvent = false;
    buttonBEvent = false;

    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    char payload[640];
    snprintf(payload, sizeof(payload),
      "{\"board\":\"esp32\","
      "\"emg\":{\"raw\":%s},"
      "\"fsr\":{\"force\":%d,\"stability\":%.1f},"
      "\"mpu\":{\"pitch\":%.2f,\"roll\":%.2f,\"velocity\":%.3f,\"ax\":%.3f,\"ay\":%.3f,\"az\":%.3f},"
      "\"vitals\":{\"hr\":%d,\"spo2\":%.1f,\"skinTemp\":%.2f,\"deltaTemp\":%.2f},"
      "\"buttons\":{\"a\":%s,\"b\":%s}}",
      emgArray, fsrLatest, fsrStability,
      mpuPitch, mpuRoll, velocity, mpuAx, mpuAy, mpuAz,
      beatAvg, spo2Estimate, skinTemp, deltaTemp,
      sentButtonA ? "true" : "false", sentButtonB ? "true" : "false");

    int code = http.POST(payload);
    if (code > 0) {
      Serial.printf("Telemetry sent -> Code: %d (emg batch=%d)\n", code, sentBatchSize);
    } else {
      Serial.printf("HTTP Error: %s\n", http.errorToString(code).c_str());
    }
    http.end();
  }

  delay(1); // yield to WiFi/background tasks
}
