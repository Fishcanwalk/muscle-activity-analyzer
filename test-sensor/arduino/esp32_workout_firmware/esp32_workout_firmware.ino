#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include "MAX30105.h"
#include "heartRate.h"
#include <WebSocketsClient.h>
#include <LiquidCrystal_I2C.h>
#include "board_config.h"

#if !defined(ESP_ARDUINO_VERSION_MAJOR) || ESP_ARDUINO_VERSION_MAJOR < 3
#error "Requires the ESP32 Arduino core 3.x"
#endif

#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>
#include <esp_task_wdt.h>
#include <esp_sleep.h>
#include <esp_timer.h>
#include <esp_system.h>
#include <driver/gpio.h>

#define BUTTON_A_PIN 32
#define BUTTON_B_PIN 33
const uint64_t BUTTON_DEBOUNCE_US = 250000ULL;
const uint32_t BUTTON_SETTLE_MS = 30;

#define BUZZER_PIN 25
const float FSR_STABILITY_ALERT_THRESHOLD = 70.0f;
const unsigned long BUZZER_BEEP_INTERVAL_MS = 150;
const unsigned long BUZZER_ALERT_DELAY_MS = 3000;
const float GRIP_ACTIVE_PCT = 20.0f;
const float GRIP_MIN_PCT = 10.0f;
const float GRIP_LOSS_RATIO = 0.6f;
const float GRIP_RECOVER_RATIO = 0.75f;
const float GRIP_LEVEL_DECAY = 0.99f;
const unsigned long GRIP_LOSS_CONFIRM_MS = 200;
const int FSR_MIN_CAL_SPAN_ADC = 100;
const int BUZZER_TEST_BEEPS = 3;

#define LCD_I2C_ADDR 0x27
#define LCD_COLS 16
#define LCD_ROWS 2
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS);

#define MPU_ADDR 0x68
#define MPU_REG_WHO_AM_I 0x75
#define MPU_REG_PWR_MGMT_1 0x6B
#define MPU_REG_GYRO_CONFIG 0x1B
#define MPU_REG_ACCEL_CONFIG 0x1C
#define MPU_REG_ACCEL_XOUT_H 0x3B
#define MPU_REG_GYRO_SCALE_LSB_PER_DPS 65.5f

#define UNO_LINK_RX_PIN 16
#define UNO_LINK_TX_PIN 17
#define UNO_LINK_BAUD 9600

const char* ssid     = "PSU888";
const char* password = "chino866";

const char* SERVER_HOST = "cyberpump.online";
const uint16_t SERVER_PORT = 3000;
const String serverUrl = String("http://") + SERVER_HOST + ":" + SERVER_PORT + "/api/telemetry";
const char* EMG_WS_PATH = "/ws/emg?role=device";
MAX30105 max30102;
Adafruit_MLX90614 mlx;

WiFiClient httpClient;
HTTPClient http;
bool tcpNoDelaySet = false;

WebSocketsClient emgSocket;
const unsigned long EMG_STREAM_INTERVAL_MS = 20;
const unsigned long EMG_WS_RECONNECT_MS = 2000;

const int32_t  HTTP_CONNECT_TIMEOUT_MS = 1500;
const uint16_t HTTP_READ_TIMEOUT_MS    = 3000;

const uint8_t HTTP_MAX_CONSECUTIVE_FAILURES = 3;
const unsigned long HTTP_BACKOFF_MS = 1000;

bool statusMpu = false;
bool statusMax = false;
bool statusMlx = false;

const unsigned long SAMPLE_INTERVAL_MS = 10;
const unsigned long SEND_INTERVAL_MS = 100;
const unsigned long LCD_UPDATE_INTERVAL_MS = 200;
const unsigned long MLX_READ_INTERVAL_MS = 250;
const unsigned long DEBUG_PRINT_INTERVAL_MS = 1000;

const int EMG_QUEUE_LEN = 64;

const unsigned long WATCHDOG_TIMEOUT_S = 8;

#define ENABLE_LIGHT_SLEEP 1
const unsigned long IDLE_SLEEP_TIMEOUT_MS = 5UL * 60UL * 1000UL;
const uint64_t IDLE_WAKE_KEEPALIVE_US = 5ULL * 1000000ULL;

#define WAKE_SRC_TIMER (1 << 0)
#define WAKE_SRC_EXT0 (1 << 1)
const uint8_t SLEEP_WAKE_SOURCE_MASK = WAKE_SRC_TIMER | WAKE_SRC_EXT0;

#define TIMER_CFG_AUTORELOAD (1 << 0)
const uint8_t SAMPLE_TIMER_CONFIG_MASK = TIMER_CFG_AUTORELOAD;

#define BUTTON_BIT_A (1ULL << BUTTON_A_PIN)
#define BUTTON_BIT_B (1ULL << BUTTON_B_PIN)
const uint64_t BUTTON_PIN_BIT_MASK = BUTTON_BIT_A | BUTTON_BIT_B;

const float GRAVITY_MSS = 9.80665f;
const float GRAVITY_FILTER_ALPHA = 0.98f;
const float VELOCITY_DECAY = 0.998f;
const float STILL_ACCEL_TOLERANCE_MSS = 0.4f;
const float STILL_GYRO_DPS = 15.0f;
const unsigned long STILL_RESET_MS = 150;
const float GRAVITY_REF_LEARN_ALPHA = 0.005f;
const float GRAVITY_REF_LEARN_GYRO_DPS = 8.0f;
float velocity = 0.0f;
float mpuAx = 0.0f, mpuAy = 0.0f, mpuAz = 0.0f;
float gravX = 0.0f, gravY = 0.0f, gravZ = 0.0f;
bool gravityInitialized = false;
float gravityRefMss = GRAVITY_MSS;
unsigned long stillSinceMs = 0;
unsigned long lastMpuMicros = 0;

int unoEmgVal = 0;
int unoFsrForce = 0;
unsigned long lastUnoRxMs = 0;
bool unoLinkWasOk = false;

const byte RATE_SIZE = 4;
byte bpmRates[RATE_SIZE];
byte bpmRateSpot = 0;
byte bpmRateCount = 0;
long lastBeat = 0;
int beatAvg = 0;
const long FINGER_PRESENT_IR_THRESHOLD = 50000;

const int SPO2_WINDOW_SAMPLES = 200;
int spo2SampleCount = 0;
long irMin = 0, irMax = 0, redMin = 0, redMax = 0;
float spo2Estimate = 98.0f;

float skinTempBaseline = 0.0f;
float skinTemp = 0.0f, deltaTemp = 0.0f;
unsigned long lastMlxReadMs = 0;
unsigned long lastDebugPrintMs = 0;

const int FSR_WINDOW_SAMPLES = 20;
int fsrHistory[FSR_WINDOW_SAMPLES];
int fsrHistoryIdx = 0;
bool fsrHistoryFull = false;

bool buzzerOn = false;
unsigned long buzzerLastToggleMs = 0;
unsigned long fsrAlertConditionSinceMs = 0;

struct SharedState {
  int fsrLatest = 0;
  float fsrStability = 100.0f;
  float velocity = 0;
  float peakVelocity = 0;
  float streamPeakVelocity = 0;
  int beatAvg = 0;
  float spo2Estimate = 98.0f;
  float skinTemp = 0, deltaTemp = 0;

  bool setActive = false;
  unsigned long setStartMs = 0;
  unsigned long restStartMs = 0;
  int setCount = 0;
  bool buttonAEventPending = false;
  bool buttonBEventPending = false;
  int fsrZeroCal = 0, fsrMaxCal = 0;
  bool buzzerTestPending = false;
  unsigned long lastActivityMs = 0;
};
SharedState shared;
SemaphoreHandle_t stateMutex;

SemaphoreHandle_t i2cMutex;

QueueHandle_t emgQueue;
QueueHandle_t buttonEventQueue;

SemaphoreHandle_t sampleTickSemaphore;
hw_timer_t *sampleTimer = nullptr;

TaskHandle_t sensorTaskHandle = nullptr;
TaskHandle_t networkTaskHandle = nullptr;
TaskHandle_t lcdTaskHandle = nullptr;
TaskHandle_t controlTaskHandle = nullptr;
TaskHandle_t emgStreamTaskHandle = nullptr;

void connectWiFi() {
  Serial.println("\n[WiFi] Setting up connection for CoEIoT...");

  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
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

void setupHttpClient() {
  http.end();
  http.begin(httpClient, serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.setReuse(true);
  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_READ_TIMEOUT_MS);
  tcpNoDelaySet = false;
}

void applyServerReply(const String &body) {
  const char *text = body.c_str();
  const char *zero = strstr(text, "\"fsrZero\":");
  const char *max = strstr(text, "\"fsrMax\":");
  bool beep = strstr(text, "\"beep\":true") != nullptr;
  if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
    if (zero && max) {
      shared.fsrZeroCal = (int)atof(zero + strlen("\"fsrZero\":"));
      shared.fsrMaxCal = (int)atof(max + strlen("\"fsrMax\":"));
    }
    if (beep) shared.buzzerTestPending = true;
    xSemaphoreGive(stateMutex);
  }
}

void IRAM_ATTR onSampleTimer() {
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  xSemaphoreGiveFromISR(sampleTickSemaphore, &xHigherPriorityTaskWoken);
  if (xHigherPriorityTaskWoken) portYIELD_FROM_ISR();
}

volatile int64_t lastButtonAIsrUs = 0;
volatile int64_t lastButtonBIsrUs = 0;

void IRAM_ATTR buttonA_isr(void *arg) {
  int64_t now = esp_timer_get_time();
  if (now - lastButtonAIsrUs < (int64_t)BUTTON_DEBOUNCE_US) return;
  lastButtonAIsrUs = now;
  uint8_t id = 0;
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  xQueueSendFromISR(buttonEventQueue, &id, &xHigherPriorityTaskWoken);
  if (xHigherPriorityTaskWoken) portYIELD_FROM_ISR();
}

void IRAM_ATTR buttonB_isr(void *arg) {
  int64_t now = esp_timer_get_time();
  if (now - lastButtonBIsrUs < (int64_t)BUTTON_DEBOUNCE_US) return;
  lastButtonBIsrUs = now;
  uint8_t id = 1;
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  xQueueSendFromISR(buttonEventQueue, &id, &xHigherPriorityTaskWoken);
  if (xHigherPriorityTaskWoken) portYIELD_FROM_ISR();
}

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

  mpuWriteReg(MPU_REG_PWR_MGMT_1, 0x01);
  delay(10);
  mpuWriteReg(MPU_REG_GYRO_CONFIG, 0x08);
  mpuWriteReg(MPU_REG_ACCEL_CONFIG, 0x10);
  return true;
}

void mpuReadMotion(float &ax, float &ay, float &az, float &gx, float &gy, float &gz) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(MPU_REG_ACCEL_XOUT_H);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)14);
  int16_t raw[7];
  for (int i = 0; i < 7; i++) raw[i] = (Wire.read() << 8) | Wire.read();
  ax = (raw[0] / 4096.0f) * GRAVITY_MSS;
  ay = (raw[1] / 4096.0f) * GRAVITY_MSS;
  az = (raw[2] / 4096.0f) * GRAVITY_MSS;
  gx = raw[4] / MPU_REG_GYRO_SCALE_LSB_PER_DPS;
  gy = raw[5] / MPU_REG_GYRO_SCALE_LSB_PER_DPS;
  gz = raw[6] / MPU_REG_GYRO_SCALE_LSB_PER_DPS;
}

void updateMpu(unsigned long nowMs) {
  float gxDps, gyDps, gzDps;
  mpuReadMotion(mpuAx, mpuAy, mpuAz, gxDps, gyDps, gzDps);

  unsigned long nowMicros = micros();
  float dt = (nowMicros - lastMpuMicros) / 1000000.0f;
  lastMpuMicros = nowMicros;
  if (dt <= 0.0f || dt > 0.1f) dt = SAMPLE_INTERVAL_MS / 1000.0f;

  if (!gravityInitialized) {
    gravX = mpuAx;
    gravY = mpuAy;
    gravZ = mpuAz;
    gravityRefMss = sqrt(mpuAx * mpuAx + mpuAy * mpuAy + mpuAz * mpuAz);
    gravityInitialized = true;
  }

  const float degToRad = PI / 180.0f;
  float wx = gxDps * degToRad, wy = gyDps * degToRad, wz = gzDps * degToRad;
  float px = gravX - (wy * gravZ - wz * gravY) * dt;
  float py = gravY - (wz * gravX - wx * gravZ) * dt;
  float pz = gravZ - (wx * gravY - wy * gravX) * dt;
  gravX = GRAVITY_FILTER_ALPHA * px + (1.0f - GRAVITY_FILTER_ALPHA) * mpuAx;
  gravY = GRAVITY_FILTER_ALPHA * py + (1.0f - GRAVITY_FILTER_ALPHA) * mpuAy;
  gravZ = GRAVITY_FILTER_ALPHA * pz + (1.0f - GRAVITY_FILTER_ALPHA) * mpuAz;

  float gravNorm = sqrt(gravX * gravX + gravY * gravY + gravZ * gravZ);
  if (gravNorm < 1.0f) return;

  float accelNorm = sqrt(mpuAx * mpuAx + mpuAy * mpuAy + mpuAz * mpuAz);
  float gyroNorm = sqrt(gxDps * gxDps + gyDps * gyDps + gzDps * gzDps);
  if (gyroNorm < GRAVITY_REF_LEARN_GYRO_DPS) {
    gravityRefMss += GRAVITY_REF_LEARN_ALPHA * (accelNorm - gravityRefMss);
  }

  float upAccel = (mpuAx * gravX + mpuAy * gravY + mpuAz * gravZ) / gravNorm - gravityRefMss;
  velocity = (velocity + upAccel * dt) * VELOCITY_DECAY;

  bool still = fabs(accelNorm - gravityRefMss) < STILL_ACCEL_TOLERANCE_MSS && gyroNorm < STILL_GYRO_DPS;
  if (!still) {
    stillSinceMs = 0;
  } else if (stillSinceMs == 0) {
    stillSinceMs = nowMs;
  } else if (nowMs - stillSinceMs >= STILL_RESET_MS) {
    velocity = 0.0f;
  }
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

  float range = hi - lo;
  float stability = 100.0f - (range / 200.0f) * 100.0f;
  return constrain(stability, 0.0f, 100.0f);
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

void buzzerSet(bool on) {
  digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
}

void updateBuzzer(unsigned long now, int fsrLatest, float fsrStability, bool setActive, int fsrZero, int fsrMax) {
  static float gripLevel = 0.0f;
  static bool gripLost = false;
  static unsigned long gripLowSinceMs = 0;

  bool calibrated = fsrMax - fsrZero >= FSR_MIN_CAL_SPAN_ADC;
  float gripPct = calibrated ? (fsrLatest - fsrZero) * 100.0f / (fsrMax - fsrZero) : 0.0f;

  if (!setActive || !calibrated) {
    gripLevel = 0.0f;
    gripLost = false;
    gripLowSinceMs = 0;
  } else {
    if (gripPct > GRIP_ACTIVE_PCT) gripLevel = max(gripLevel * GRIP_LEVEL_DECAY, gripPct);
    if (gripLevel > 0.0f) {
      bool low = gripPct < GRIP_MIN_PCT || gripPct < gripLevel * GRIP_LOSS_RATIO;
      bool recovered = gripPct > GRIP_MIN_PCT && gripPct >= gripLevel * GRIP_RECOVER_RATIO;
      if (!low) gripLowSinceMs = 0;
      else if (gripLowSinceMs == 0) gripLowSinceMs = now;

      if (gripLost) {
        if (recovered) gripLost = false;
      } else if (gripLowSinceMs != 0 && now - gripLowSinceMs >= GRIP_LOSS_CONFIRM_MS) {
        gripLost = true;
      }
    }
  }

  bool unsteady = setActive && gripLevel > 0.0f && fsrStability < FSR_STABILITY_ALERT_THRESHOLD;
  if (!unsteady) {
    fsrAlertConditionSinceMs = 0;
  } else if (fsrAlertConditionSinceMs == 0) {
    fsrAlertConditionSinceMs = now;
  }
  bool unsteadyTooLong = unsteady && (now - fsrAlertConditionSinceMs) >= BUZZER_ALERT_DELAY_MS;

  bool shouldAlert = gripLost || unsteadyTooLong;

  static bool wasAlerting = false;
  if (shouldAlert != wasAlerting) {
    wasAlerting = shouldAlert;
    Serial.printf("[BUZZER] %s (grip=%.0f%% held=%.0f%% raw=%d cal=%d..%d stability=%.0f%%)\n",
                  shouldAlert ? (gripLost ? "grip lost -> ON" : "unsteady -> ON") : "OFF",
                  gripPct, gripLevel, fsrLatest, fsrZero, fsrMax, fsrStability);
  }

  if (!shouldAlert) {
    if (buzzerOn) {
      buzzerOn = false;
      buzzerSet(false);
    }
    return;
  }

  if (now - buzzerLastToggleMs >= BUZZER_BEEP_INTERVAL_MS) {
    buzzerLastToggleMs = now;
    buzzerOn = !buzzerOn;
    buzzerSet(buzzerOn);
  }
}

void updateLcd(unsigned long now, bool setActive, unsigned long setStartMs, unsigned long restStartMs, int setCount) {
  unsigned long elapsedMs = setActive ? (now - setStartMs) : (now - restStartMs);
  unsigned long totalSec = elapsedMs / 1000;
  int mm = (int)((totalSec / 60) % 100);
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

  if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
    lcd.setCursor(0, 0);
    lcd.print(line1);
    for (int i = strlen(line1); i < LCD_COLS; i++) lcd.print(' ');

    lcd.setCursor(0, 1);
    lcd.print(line2);
    for (int i = strlen(line2); i < LCD_COLS; i++) lcd.print(' ');
    xSemaphoreGive(i2cMutex);
  }
}

void initWatchdog() {
  esp_task_wdt_config_t twdt_config = {
    .timeout_ms = (uint32_t)(WATCHDOG_TIMEOUT_S * 1000),
    .idle_core_mask = 0,
    .trigger_panic = true,
  };
  if (esp_task_wdt_init(&twdt_config) != ESP_OK) {
    esp_task_wdt_reconfigure(&twdt_config);
  }
}

void enterLightSleepUntilWake() {
  Serial.println("[POWER] Long idle detected -- entering light sleep.");

  if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    lcd.setCursor(0, 0);
    lcd.print("SLEEPING...     ");
    lcd.setCursor(0, 1);
    lcd.print("PRESS ANY BUTTON");
    xSemaphoreGive(i2cMutex);
  }

  WiFi.disconnect(true);
  tcpNoDelaySet = false;

  esp_task_wdt_delete(sensorTaskHandle);
  esp_task_wdt_delete(networkTaskHandle);
  esp_task_wdt_delete(lcdTaskHandle);
  esp_task_wdt_delete(controlTaskHandle);
  esp_task_wdt_delete(emgStreamTaskHandle);
  esp_task_wdt_deinit();

  if (SLEEP_WAKE_SOURCE_MASK & WAKE_SRC_EXT0) {
    esp_sleep_enable_ext0_wakeup((gpio_num_t)BUTTON_A_PIN, 0  );
  }
  if (SLEEP_WAKE_SOURCE_MASK & WAKE_SRC_TIMER) {
    esp_sleep_enable_timer_wakeup(IDLE_WAKE_KEEPALIVE_US);
  }

  esp_light_sleep_start();

  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  Serial.printf("[POWER] Woke from light sleep (cause=%d), resubscribing watchdog + reconnecting WiFi...\n", (int)cause);

  initWatchdog();
  esp_task_wdt_add(sensorTaskHandle);
  esp_task_wdt_add(networkTaskHandle);
  esp_task_wdt_add(lcdTaskHandle);
  esp_task_wdt_add(controlTaskHandle);
  esp_task_wdt_add(emgStreamTaskHandle);

  connectWiFi();
}

void sensorTask(void *pvParameters) {
  lastMpuMicros = micros();

  for (;;) {
    xSemaphoreTake(sampleTickSemaphore, portMAX_DELAY);
    esp_task_wdt_reset();

    unsigned long now = millis();

    pollUnoLink();

    int emgVal = unoEmgVal;
    int fsrVal = unoFsrForce;
    updateFsrStability(fsrVal);
    float stability = computeFsrStability();

    if (xQueueSend(emgQueue, &emgVal, 0) != pdTRUE) {
      int discarded;
      xQueueReceive(emgQueue, &discarded, 0);
      xQueueSend(emgQueue, &emgVal, 0);
    }

    long lastIrValue = 0, lastRedValue = 0;
    if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
      if (statusMpu) updateMpu(now);

      if (statusMax) {
        max30102.check();

        while (max30102.available()) {
          long irValue = max30102.getFIFOIR();
          long redValue = max30102.getFIFORed();
          lastIrValue = irValue;
          lastRedValue = redValue;

          if (irValue > FINGER_PRESENT_IR_THRESHOLD) {
            if (checkForBeat(irValue)) {
              long delta = millis() - lastBeat;
              lastBeat = millis();
              float bpm = 60.0f / (delta / 1000.0f);
              if (bpm > 40 && bpm < 220) {
                bpmRates[bpmRateSpot++] = (byte)bpm;
                bpmRateSpot %= RATE_SIZE;
                if (bpmRateCount < RATE_SIZE) bpmRateCount++;
                if (bpmRateCount == RATE_SIZE) {
                  long sum = 0;
                  for (byte i = 0; i < RATE_SIZE; i++) sum += bpmRates[i];
                  beatAvg = sum / RATE_SIZE;
                }
              }
            }
            updateSpo2Window(irValue, redValue);
          } else {
            beatAvg = 0;
            bpmRateCount = 0;
            lastBeat = 0;
          }

          max30102.nextSample();
        }
      }

      if (statusMlx && now - lastMlxReadMs >= MLX_READ_INTERVAL_MS) {
        lastMlxReadMs = now;
        float t = mlx.readObjectTempC();
        if (!isnan(t)) {
          skinTemp = t;
          deltaTemp = skinTemp - skinTempBaseline;
        }
      }

      xSemaphoreGive(i2cMutex);
    }

    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
      shared.fsrLatest = fsrVal;
      shared.fsrStability = stability;
      shared.velocity = velocity;
      if (velocity > shared.peakVelocity) shared.peakVelocity = velocity;
      if (velocity > shared.streamPeakVelocity) shared.streamPeakVelocity = velocity;
      shared.beatAvg = beatAvg;
      shared.spo2Estimate = spo2Estimate;
      shared.skinTemp = skinTemp;
      shared.deltaTemp = deltaTemp;
      xSemaphoreGive(stateMutex);
    }

    if (now - lastDebugPrintMs >= DEBUG_PRINT_INTERVAL_MS) {
      lastDebugPrintMs = now;
      Serial.printf(
        "[SENSORS] core=%d | EMG=%d | FSR=%d stability=%.1f%% | "
        "MPU vel=%.2f | HR=%d SpO2=%.1f%% | "
        "skinTemp=%.1fC dTemp=%.1fC | IR=%ld RED=%ld finger=%s\n",
        xPortGetCoreID(), emgVal, fsrVal, stability,
        velocity, beatAvg, spo2Estimate,
        skinTemp, deltaTemp, lastIrValue, lastRedValue,
        lastIrValue > FINGER_PRESENT_IR_THRESHOLD ? "yes" : "no");
    }
  }
}

void networkTask(void *pvParameters) {
  TickType_t lastWake = xTaskGetTickCount();
  uint8_t consecutiveFailures = 0;
  TickType_t retryAfter = 0;

  for (;;) {
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(SEND_INTERVAL_MS));
    esp_task_wdt_reset();

    if (WiFi.status() != WL_CONNECTED) continue;

    if (consecutiveFailures >= HTTP_MAX_CONSECUTIVE_FAILURES && (int32_t)(xTaskGetTickCount() - retryAfter) < 0) {
      continue;
    }

    SharedState snap;
    bool sentButtonA = false, sentButtonB = false;
    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
      snap = shared;
      shared.peakVelocity = shared.velocity;
      sentButtonA = shared.buttonAEventPending;
      sentButtonB = shared.buttonBEventPending;
      shared.buttonAEventPending = false;
      shared.buttonBEventPending = false;
      xSemaphoreGive(stateMutex);
    }

    char payload[768];
    snprintf(payload, sizeof(payload),
             "{\"board\":\"esp32\","
             "\"fsr\":{\"force\":%d,\"stability\":%.1f},"
             "\"mpu\":{\"velocity\":%.3f,\"peakVelocity\":%.3f},"
             "\"vitals\":{\"hr\":%d,\"spo2\":%.1f,\"skinTemp\":%.2f,\"deltaTemp\":%.2f},"
             "\"buttons\":{\"a\":%s,\"b\":%s}}",
             snap.fsrLatest, snap.fsrStability,
             snap.velocity, snap.peakVelocity,
             snap.beatAvg, snap.spo2Estimate, snap.skinTemp, snap.deltaTemp,
             sentButtonA ? "true" : "false", sentButtonB ? "true" : "false");

    unsigned long postStartMs = millis();
    int code = http.POST(payload);
    esp_task_wdt_reset();
    unsigned long postDurationMs = millis() - postStartMs;

    if (code > 0) {
      consecutiveFailures = 0;
      if (!tcpNoDelaySet) {
        httpClient.setNoDelay(true);
        tcpNoDelaySet = true;
      }
      applyServerReply(http.getString());
      Serial.printf("Telemetry sent -> Code: %d [POST took %lums]\n", code, postDurationMs);
      if (code >= 400) Serial.printf("Payload was: %s\n", payload);
    } else {
      if (consecutiveFailures < 255) consecutiveFailures++;
      Serial.printf("HTTP Error: %s [POST took %lums] (fail #%u) | SSID=%s myIP=%s gw=%s RSSI=%d -> %s\n",
                    http.errorToString(code).c_str(), postDurationMs, consecutiveFailures,
                    WiFi.SSID().c_str(),
                    WiFi.localIP().toString().c_str(),
                    WiFi.gatewayIP().toString().c_str(),
                    WiFi.RSSI(),
                    serverUrl.c_str());

      setupHttpClient();

      if (consecutiveFailures >= HTTP_MAX_CONSECUTIVE_FAILURES) {
        retryAfter = xTaskGetTickCount() + pdMS_TO_TICKS(HTTP_BACKOFF_MS);
        Serial.printf("[NET] Server unreachable -- backing off %lums\n", HTTP_BACKOFF_MS);
      }

      if (sentButtonA || sentButtonB) {
        if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
          shared.buttonAEventPending |= sentButtonA;
          shared.buttonBEventPending |= sentButtonB;
          xSemaphoreGive(stateMutex);
        }
      }
    }
  }
}

void onEmgSocketEvent(WStype_t type, uint8_t *payload, size_t length) {
  if (type == WStype_CONNECTED) Serial.println("[EMG-WS] connected");
  else if (type == WStype_DISCONNECTED) Serial.println("[EMG-WS] disconnected");
}

void emgStreamTask(void *pvParameters) {
  emgSocket.begin(SERVER_HOST, SERVER_PORT, EMG_WS_PATH);
  emgSocket.onEvent(onEmgSocketEvent);
  emgSocket.setReconnectInterval(EMG_WS_RECONNECT_MS);

  TickType_t lastWake = xTaskGetTickCount();
  for (;;) {
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(EMG_STREAM_INTERVAL_MS));
    esp_task_wdt_reset();

    if (WiFi.status() == WL_CONNECTED) emgSocket.loop();

    char frame[EMG_QUEUE_LEN * 6 + 16];
    int pos = 0;
    int count = 0;
    int sample;
    while (pos < (int)sizeof(frame) - 24 && xQueueReceive(emgQueue, &sample, 0) == pdTRUE) {
      pos += snprintf(frame + pos, sizeof(frame) - pos, "%s%d", count == 0 ? "" : ",", sample);
      count++;
    }
    if (count == 0) continue;

    float framePeakVelocity = 0.0f;
    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
      framePeakVelocity = shared.streamPeakVelocity;
      shared.streamPeakVelocity = shared.velocity;
      xSemaphoreGive(stateMutex);
    }
    pos += snprintf(frame + pos, sizeof(frame) - pos, "|%.3f", framePeakVelocity);
    if (emgSocket.isConnected()) emgSocket.sendTXT(frame, pos);
  }
}

void lcdTask(void *pvParameters) {
  TickType_t lastWake = xTaskGetTickCount();

  for (;;) {
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(LCD_UPDATE_INTERVAL_MS));
    esp_task_wdt_reset();

    bool setActive;
    unsigned long setStartMs, restStartMs;
    int setCount;
    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) != pdTRUE) continue;
    setActive = shared.setActive;
    setStartMs = shared.setStartMs;
    restStartMs = shared.restStartMs;
    setCount = shared.setCount;
    xSemaphoreGive(stateMutex);

    updateLcd(millis(), setActive, setStartMs, restStartMs, setCount);
  }
}

void controlTask(void *pvParameters) {
  const gpio_num_t buttonPins[2] = { (gpio_num_t)BUTTON_A_PIN, (gpio_num_t)BUTTON_B_PIN };
  bool buttonArmed[2] = { true, true };

  for (;;) {
    esp_task_wdt_reset();

    for (int i = 0; i < 2; i++) {
      if (gpio_get_level(buttonPins[i]) == 1) buttonArmed[i] = true;
    }

    uint8_t buttonId;
    if (xQueueReceive(buttonEventQueue, &buttonId, pdMS_TO_TICKS(100)) == pdTRUE && buttonId < 2) {
      vTaskDelay(pdMS_TO_TICKS(BUTTON_SETTLE_MS));
      bool isRealPress = buttonArmed[buttonId] && gpio_get_level(buttonPins[buttonId]) == 0;
      if (isRealPress) buttonArmed[buttonId] = false;

      unsigned long pressNow = millis();
      if (isRealPress && xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        if (buttonId == 0) {
          shared.setActive = !shared.setActive;
          if (shared.setActive) {
            shared.setStartMs = pressNow;
            shared.setCount++;
          } else {
            shared.restStartMs = pressNow;
          }
          shared.buttonAEventPending = true;
        } else {
          shared.setActive = false;
          shared.restStartMs = pressNow;
          shared.setCount = 0;
          shared.buttonBEventPending = true;
        }
        shared.lastActivityMs = pressNow;
        xSemaphoreGive(stateMutex);
      }
    }

    unsigned long now = millis();
    int fsrLatest = 0;
    float fsrStability = 100.0f;
    bool setActive = false;
    int fsrZero = 0, fsrMax = 0;
    bool buzzerTest = false;
    bool idleForSleep = false;
    unsigned long idleForMs = 0;

    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
      fsrLatest = shared.fsrLatest;
      fsrStability = shared.fsrStability;
      setActive = shared.setActive;
      fsrZero = shared.fsrZeroCal;
      fsrMax = shared.fsrMaxCal;
      buzzerTest = shared.buzzerTestPending;
      shared.buzzerTestPending = false;
      if (!shared.setActive && shared.setCount == 0) {
        idleForMs = now - shared.lastActivityMs;
      }
      xSemaphoreGive(stateMutex);
    }
    if (buzzerTest) {
      Serial.println("[BUZZER] test requested from the web");
      for (int i = 0; i < BUZZER_TEST_BEEPS; i++) {
        buzzerSet(true);
        vTaskDelay(pdMS_TO_TICKS(150));
        buzzerSet(false);
        vTaskDelay(pdMS_TO_TICKS(150));
      }
      buzzerOn = false;
    }
    updateBuzzer(now, fsrLatest, fsrStability, setActive, fsrZero, fsrMax);

#if ENABLE_LIGHT_SLEEP
    idleForSleep = idleForMs >= IDLE_SLEEP_TIMEOUT_MS;
    if (idleForSleep) {
      enterLightSleepUntilWake();
      if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        shared.lastActivityMs = millis();
        xSemaphoreGive(stateMutex);
      }
    }
#endif
  }
}

void setup() {
  Serial.begin(115200);
  delay(100);

  pinMode(BUZZER_PIN, OUTPUT);
  buzzerSet(false);
  for (int i = 0; i < 2; i++) {
    buzzerSet(true);
    delay(150);
    buzzerSet(false);
    delay(150);
  }

  Serial2.begin(UNO_LINK_BAUD, SERIAL_8N1, UNO_LINK_RX_PIN, UNO_LINK_TX_PIN);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);

  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Booting...");

  for (int attempt = 0; attempt < 5 && !statusMpu; attempt++) {
    if (attempt > 0) delay(100);
    statusMpu = mpuBegin();
  }
  Serial.println(statusMpu ? "[I2C] MPU-6050/6500  (0x68) -> OK"
                           : "[I2C] MPU-6050/6500  (0x68) -> FAILED (velocity will read 0)");

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

  Serial.printf("[BOOT] Free heap before WiFi: %lu bytes\n", (unsigned long)esp_get_free_heap_size());
  connectWiFi();

  setupHttpClient();
  Serial.printf("[BOOT] Free heap after WiFi init: %lu bytes\n", (unsigned long)esp_get_free_heap_size());

  stateMutex = xSemaphoreCreateMutex();
  i2cMutex = xSemaphoreCreateMutex();
  sampleTickSemaphore = xSemaphoreCreateBinary();
  emgQueue = xQueueCreate(EMG_QUEUE_LEN, sizeof(int));
  buttonEventQueue = xQueueCreate(8, sizeof(uint8_t));

  shared.lastActivityMs = millis();

  initWatchdog();

  gpio_config_t buttonIoConf = {};
  buttonIoConf.pin_bit_mask = BUTTON_PIN_BIT_MASK;
  buttonIoConf.mode = GPIO_MODE_INPUT;
  buttonIoConf.pull_up_en = GPIO_PULLUP_ENABLE;
  buttonIoConf.pull_down_en = GPIO_PULLDOWN_DISABLE;
  buttonIoConf.intr_type = GPIO_INTR_NEGEDGE;
  gpio_config(&buttonIoConf);

  gpio_install_isr_service(0);
  gpio_isr_handler_add((gpio_num_t)BUTTON_A_PIN, buttonA_isr, nullptr);
  gpio_isr_handler_add((gpio_num_t)BUTTON_B_PIN, buttonB_isr, nullptr);

  sampleTimer = timerBegin(1000000);
  timerAttachInterrupt(sampleTimer, &onSampleTimer);
  timerAlarm(sampleTimer, SAMPLE_INTERVAL_MS * 1000, (SAMPLE_TIMER_CONFIG_MASK & TIMER_CFG_AUTORELOAD) != 0, 0);
  timerStart(sampleTimer);

  xTaskCreatePinnedToCore(sensorTask, "SensorTask", 4096, nullptr, 3, &sensorTaskHandle, 1);
  xTaskCreatePinnedToCore(networkTask, "NetworkTask", 8192, nullptr, 2, &networkTaskHandle, 0);
  xTaskCreatePinnedToCore(lcdTask, "LcdTask", 2560, nullptr, 1, &lcdTaskHandle, 1);
  xTaskCreatePinnedToCore(controlTask, "ControlTask", 2560, nullptr, 2, &controlTaskHandle, 1);
  xTaskCreatePinnedToCore(emgStreamTask, "EmgStreamTask", 6144, nullptr, 3, &emgStreamTaskHandle, 0);

  esp_task_wdt_add(sensorTaskHandle);
  esp_task_wdt_add(networkTaskHandle);
  esp_task_wdt_add(lcdTaskHandle);
  esp_task_wdt_add(controlTaskHandle);
  esp_task_wdt_add(emgStreamTaskHandle);

  Serial.printf("[BOOT] Free heap after task creation: %lu bytes\n", (unsigned long)esp_get_free_heap_size());
}

void loop() {
  vTaskDelete(NULL);
}
