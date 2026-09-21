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

// Buzzer: warns when grip force (FSR) drops too low during an active set.
// GPIO 25 is free (not I2C/ADC1/button), and works as a plain digital output
// regardless of WiFi (the ADC2-vs-WiFi conflict only affects analogRead).
#define BUZZER_PIN 25
const int FSR_LOW_FORCE_THRESHOLD = 300;    // ADC counts (0-4095); below this = "losing grip"
const int FSR_LOW_FORCE_HYSTERESIS = 50;    // must rise above threshold+this to clear the alert
const float FSR_STABILITY_ALERT_THRESHOLD = 70.0f; // % from computeFsrStability(); below this = "not steady"
const unsigned long BUZZER_BEEP_INTERVAL_MS = 150; // on/off toggle period while alerting
const unsigned long BUZZER_ALERT_DELAY_MS = 3000;  // must stay flagged this long before it sounds
bool buzzerOn = false;
unsigned long buzzerLastToggleMs = 0;
unsigned long fsrAlertConditionSinceMs = 0; // 0 = condition not currently met

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

// Local set timer shown on the LCD, driven purely by the button presses below --
// rep count and elapsed time are display-only and are never sent to the web app
// (see the `buttons` payload further down, which carries only discrete press events).
bool setActive = false;
unsigned long setStartMs = 0;
unsigned long restStartMs = 0; // when the current rest period began (set stopped/reset)
int setCount = 0; // increments each time a new set starts (button A), shown on line 1

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

// sEMG + FSR now come from an Arduino Uno over UART instead of this board's
// own analogRead() -- see uno_emg_fsr_link.cpp and PINS.md for the wiring
// and why the Uno rescales its 10-bit ADC up to these same 12-bit counts.
#define UNO_LINK_RX_PIN 16
#define UNO_LINK_TX_PIN 17
#define UNO_LINK_BAUD   9600
int unoEmgVal = 0;
int unoFsrForce = 0;
unsigned long lastUnoRxMs = 0;
bool unoLinkWasOk = false; // edge-detect so the log line only prints on change

// Non-blocking line reader for the "emg,fsr\n" packets the Uno sends every
// ~10ms. Called every loop() iteration (not gated by SAMPLE_INTERVAL_MS) so
// the UART buffer never backs up between fast-sample ticks.
void pollUnoLink() {
  static char lineBuf[32];
  static uint8_t lineLen = 0;

  while (Serial2.available()) {
    char c = (char)Serial2.read();
    if (c == '\n') {
      lineBuf[lineLen] = '\0';
      int emg, fsr;
      if (sscanf(lineBuf, "%d,%d", &emg, &fsr) == 2) {
        unoEmgVal = emg;
        unoFsrForce = fsr;
        lastUnoRxMs = millis();
      }
      lineLen = 0;
    } else if (c != '\r' && lineLen < sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = c;
    }
  }

  // No valid line in 500ms = treat the link as down (Uno unplugged/reset);
  // values stay at their last-known reading rather than resetting to 0.
  bool unoLinkOk = (millis() - lastUnoRxMs) < 500;
  if (unoLinkOk != unoLinkWasOk) {
    unoLinkWasOk = unoLinkOk;
    Serial.println(unoLinkOk ? "[UART] Uno EMG/FSR link OK" : "[UART] Uno EMG/FSR link LOST (no data in 500ms)");
  }
}

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
const char* ssid     = "Nig";
const char* password = "chicken123123";

// IP คอมพิวเตอร์ของคุณ (ดูจากคำสั่ง hostname -I บนคอม)
const char* serverUrl = "http://172.20.10.3:5173/api/telemetry";

// ----------------------------------------------------
// Sensor objects (see docs/sensor_usage.md for the 6-sensor fusion design)
// ----------------------------------------------------
MAX30105          max30102;
Adafruit_MLX90614 mlx;

// Persistent HTTP client + TCP connection, reused across every telemetry POST
// instead of reconnecting from scratch each cycle -- a fresh TCP handshake was
// taking 80-110ms out of every 100ms send interval, starving the 100Hz sensor
// sampling loop (MAX30102 beat detection needs continuous sampling to see the
// pulse waveform; the MPU velocity integration's dt also got skewed by the stall).
WiFiClient httpClient;
HTTPClient http;

bool statusMpu = false;
bool statusMax = false;
bool statusMlx = false;

// ----------------------------------------------------
// Timing: sample sensors fast (for waveform fidelity / integration accuracy),
// but only POST to the web API at a lower rate to cut WiFi/HTTP overhead.
// ----------------------------------------------------
const unsigned long SAMPLE_INTERVAL_MS = 10;  // 100 Hz local sensor sampling
// 4 Hz network send (was 10 Hz/100ms) -- http.POST() blocks the loop for tens
// of ms per call, which was starving the 100Hz sampling MAX30102's beat
// detection needs to see the pulse waveform; sending less often gives it more
// uninterrupted room between blocking calls.
const unsigned long SEND_INTERVAL_MS   = 250;
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
  delay(100); // let UART settle before any output, otherwise the first line(s) get garbled

  pinMode(BUTTON_A_PIN, INPUT_PULLUP);
  pinMode(BUTTON_B_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  Serial2.begin(UNO_LINK_BAUD, SERIAL_8N1, UNO_LINK_RX_PIN, UNO_LINK_TX_PIN);
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

  // max30102.begin() calls Wire.setClock(I2C_SPEED_FAST) internally, silently
  // undoing the conservative 100kHz speed set above -- put it back before the
  // rest of the bus (MLX90614, LCD, MPU reads in the main loop) uses it, or
  // the faster clock causes intermittent timeouts on breadboard/long wiring.
  Wire.setClock(100000);

  for (int attempt = 0; attempt < 5 && !statusMlx; attempt++) {
    if (attempt > 0) delay(100);
    statusMlx = mlx.begin(0x5A, &Wire);
  }
  if (statusMlx) {
    float baseline = mlx.readObjectTempC();
    if (!isnan(baseline)) skinTempBaseline = baseline;
    Serial.println("[I2C] MLX90614  (0x5A) -> OK");
  } else {
    Serial.println("[I2C] MLX90614  (0x5A) -> FAILED (skinTemp/deltaTemp will read 0)");
  }

  for (int i = 0; i < FSR_WINDOW_SAMPLES; i++) fsrHistory[i] = 0;

  connectWiFi();

  http.begin(httpClient, serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.setReuse(true); // keep the TCP connection open between POSTs
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

// Beeps in a non-blocking on/off pattern while a set is active AND the grip is
// either weak (FSR below the low-force threshold, with hysteresis to prevent
// chatter right at the threshold) or unsteady (stability below
// FSR_STABILITY_ALERT_THRESHOLD) -- gating on setActive keeps it quiet at
// rest (idle hands read near-zero force, which isn't a "weak grip" event).
// Either condition must hold continuously for BUZZER_ALERT_DELAY_MS before it
// actually sounds, so a brief blip doesn't trigger it.
void updateBuzzer(unsigned long now) {
  static bool lowForce = false;
  if (lowForce) {
    if (fsrLatest > FSR_LOW_FORCE_THRESHOLD + FSR_LOW_FORCE_HYSTERESIS) lowForce = false;
  } else {
    if (fsrLatest < FSR_LOW_FORCE_THRESHOLD) lowForce = true;
  }

  bool unsteady = computeFsrStability() < FSR_STABILITY_ALERT_THRESHOLD;
  bool conditionMet = setActive && (lowForce || unsteady);

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
// BUTTON_DEBOUNCE_MS to filter contact bounce. Sets `eventFlag` true on a
// clean press; the caller latches it until the next network send. Also
// returns true for just this one tick, so callers needing a one-shot
// (e.g. the local LCD set timer) don't have to wait for/interfere with
// that network-send latch.
bool pollButtonEdge(int pin, bool &lastLevel, unsigned long &lastEdgeMs, bool &eventFlag, unsigned long now) {
  bool level = (digitalRead(pin) == LOW);
  bool justPressed = false;
  if (level && !lastLevel && (now - lastEdgeMs) >= BUTTON_DEBOUNCE_MS) {
    eventFlag = true;
    justPressed = true;
    lastEdgeMs = now;
  }
  lastLevel = level;
  return justPressed;
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

// Line 1: current set number + status, driven by button A (start/stop) and
// button B (reset) -- STOP before any set has ever started (setCount == 0),
// RUNNING while active, RESTING between sets otherwise. Line 2: a matching
// live-counting timer (RUN / READY / REST). Neither value is sent to the web
// app, which tracks its own rep count (camera-driven) and set state
// independently.
void updateLcd(unsigned long now) {
  unsigned long elapsedMs = setActive ? (now - setStartMs) : (now - restStartMs);
  unsigned long totalSec = elapsedMs / 1000;
  int mm = (int)((totalSec / 60) % 100); // clamp so it always fits mm:ss
  int ss = (int)(totalSec % 60);

  char line1[LCD_COLS + 1];
  char line2[LCD_COLS + 1];
  if (!setActive && setCount == 0) {
    snprintf(line1, sizeof(line1), "PRESS GREEN");
    snprintf(line2, sizeof(line2), "BUTTON TO START");
  } else {
    snprintf(line1, sizeof(line1), "SET:%d %s", setCount, setActive ? "RUNNING" : "RESTING");
    snprintf(line2, sizeof(line2), "%s:%02d:%02d", "TIME", mm, ss);
  }

  lcd.setCursor(0, 0);
  lcd.print(line1);
  for (int i = strlen(line1); i < LCD_COLS; i++) lcd.print(' ');

  lcd.setCursor(0, 1);
  lcd.print(line2);
  for (int i = strlen(line2); i < LCD_COLS; i++) lcd.print(' ');
}

void loop() {
  unsigned long now = millis();

  pollUnoLink(); // drain the UART buffer every iteration, not just every 10ms tick

  // ---- Fast local sampling (100 Hz): EMG waveform fidelity, accurate MPU dt
  // integration, FSR stability window, and MAX30102 beat detection all need
  // frequent polling even though we only POST to the API at a lower rate. ----
  if (now - lastSampleMs >= SAMPLE_INTERVAL_MS) {
    lastSampleMs = now;

    // Temporary debug: count how many times this "100Hz" block actually runs
    // per second, to see whether something (I2C, HTTP) is silently slowing it
    // down well below the coded 10ms/100Hz target.
    static int sampleRateCounter = 0;
    static unsigned long lastSampleRatePrintMs = 0;
    sampleRateCounter++;
    if (now - lastSampleRatePrintMs >= 1000) {
      Serial.printf("[RATE] actual fast-sample loop: %d Hz (target 100 Hz)\n", sampleRateCounter);
      sampleRateCounter = 0;
      lastSampleRatePrintMs = now;
    }

    // Buttons: debounced press-edge detection; events latch until the next send.
    bool buttonAJustPressed = pollButtonEdge(BUTTON_A_PIN, buttonALastLevel, buttonALastEdgeMs, buttonAEvent, now);
    bool buttonBJustPressed = pollButtonEdge(BUTTON_B_PIN, buttonBLastLevel, buttonBLastEdgeMs, buttonBEvent, now);
    buttonAPressed = buttonALastLevel;
    buttonBPressed = buttonBLastLevel;

    // Local LCD set timer, independent of the web app's own start/stop/save
    // logic: A starts a fresh timer on the first press of a set and freezes
    // it on the next (stop); B (stop + save session) resets everything so
    // the LCD is ready for a brand-new session.
    if (buttonAJustPressed) {
      setActive = !setActive;
      if (setActive) {
        setStartMs = now;
        setCount++;
      } else {
        restStartMs = now; // rest timer starts counting up from here
      }
    }
    if (buttonBJustPressed) {
      setActive = false;
      restStartMs = now;
      repCount = 0;
      setCount = 0;
    }

    // sEMG + FSR (raw ADC counts; server converts to µV / N, see telemetryStore.ts).
    // Read from the Uno link, not this board's own analogRead() -- see
    // pollUnoLink() above and uno_emg_fsr_link.cpp for where these come from.
    int emgVal = unoEmgVal;
    fsrLatest = unoFsrForce;
    updateFsrStability(fsrLatest);
    updateBuzzer(now);
    if (emgBatchCount < EMG_BATCH_CAPACITY) emgBatch[emgBatchCount++] = emgVal;

    static unsigned long lastFsrDebugMs = 0;
    if (now - lastFsrDebugMs >= 500) {
      lastFsrDebugMs = now;
      Serial.printf("[EMG] raw=%d | [FSR] raw=%d stability=%.1f%%\n", emgVal, fsrLatest, computeFsrStability());
    }

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

    // MAX30102: heart rate (BPM) + rough SpO2 estimate.
    //
    // check() is a cheap, non-blocking poll of the sensor's FIFO (just reads
    // two pointer registers if nothing new is ready). The old code called the
    // library's getIR()/getRed() convenience wrappers instead, which each
    // call safeCheck() internally -- a busy-wait loop that blocks for up to
    // 250ms until a *new* sample lands in the FIFO. Calling both back-to-back
    // meant waiting for two separate sensor sample cycles per loop iteration,
    // which was stalling the whole 100Hz fast-sample loop down to ~15Hz and
    // starving the beat-detection algorithm of the continuous sampling it
    // needs to see the pulse waveform. Reading straight from the local FIFO
    // buffer (getFIFOIR/getFIFORed + nextSample) is O(1) with no I2C wait.
    if (statusMax) {
      max30102.check();

      while (max30102.available()) {
        long irValue = max30102.getFIFOIR();
        long redValue = max30102.getFIFORed();

        static unsigned long lastIrDebugMs = 0;
        if (now - lastIrDebugMs >= 500) {
          lastIrDebugMs = now;
          Serial.printf("[MAX30102] IR=%ld RED=%ld threshold=%ld finger=%s beatAvg=%d\n",
            irValue, redValue, (long)FINGER_PRESENT_IR_THRESHOLD,
            irValue > FINGER_PRESENT_IR_THRESHOLD ? "yes" : "no", beatAvg);
        }

        if (irValue > FINGER_PRESENT_IR_THRESHOLD) {
          if (checkForBeat(irValue)) {
            long delta = millis() - lastBeat;
            lastBeat = millis();
            float bpm = 60.0f / (delta / 1000.0f);
            // Physiologically plausible resting/exercising HR range -- 20-255 let
            // obvious noise (e.g. a motion-artifact "beat" every 2s = 27 BPM)
            // through and pollute the rolling average.
            Serial.printf("[MAX30102] beat detected! delta=%ldms bpm=%.1f %s\n",
              delta, bpm, (bpm > 40 && bpm < 220) ? "(accepted)" : "(rejected, out of 40-220 range)");
            if (bpm > 40 && bpm < 220) {
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

        max30102.nextSample();
      }
    }
  }

  // ---- LCD refresh (5 Hz): independent of the network send rate so the
  // display keeps updating even if WiFi/the API is down. ----
  if (now - lastLcdMs >= LCD_UPDATE_INTERVAL_MS) {
    lastLcdMs = now;
    updateLcd(now);
  }

  // ---- Slow network send (10 Hz): batch every EMG sample collected since the
  // last send so no signal is lost even though we POST less often. ----
  if (WiFi.status() == WL_CONNECTED && now - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = now;

    // MLX90614 changes slowly -- only worth reading once per network send.
    // `static` so a failed/NaN read (e.g. I2C hiccup) keeps the last good
    // value instead of sending NaN, which is invalid JSON and would get the
    // whole packet rejected by the server (see telemetryStore.ts).
    static float skinTemp = 0, deltaTemp = 0;
    if (statusMlx) {
      float t = mlx.readObjectTempC();
      if (!isnan(t)) {
        skinTemp = t;
        deltaTemp = skinTemp - skinTempBaseline;
      }
    }

    float fsrStability = computeFsrStability();

    char emgArray[192]; // fits EMG_BATCH_CAPACITY (~27 at 250ms/10ms) worst-case 4-digit values
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

    unsigned long postStartMs = millis();
    int code = http.POST(payload);
    unsigned long postDurationMs = millis() - postStartMs;
    if (code > 0) {
      Serial.printf("Telemetry sent -> Code: %d (emg batch=%d) [POST took %lums]\n", code, sentBatchSize, postDurationMs);
      if (code >= 400) Serial.printf("Payload was: %s\n", payload);
    } else {
      Serial.printf("HTTP Error: %s [POST took %lums]\n", http.errorToString(code).c_str(), postDurationMs);
    }
  }

  delay(1); // yield to WiFi/background tasks
}
