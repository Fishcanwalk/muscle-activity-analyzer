#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include "MAX30105.h"
#include "heartRate.h"
#include <LiquidCrystal_I2C.h>
#include "board_config.h"

// FreeRTOS/ESP-IDF power-management APIs. This firmware runs as 4 pinned
// FreeRTOS tasks (SensorTask/NetworkTask/LcdTask/ControlTask) instead of one
// polling loop() -- see docs/firmware_rtos_power.md for the full design.
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>
#include <esp_task_wdt.h>
#include <esp_sleep.h>
#include <esp_timer.h>
#include <esp_system.h>
#include <driver/gpio.h>

// Two buttons, INPUT_PULLUP (pressed = LOW). See PINS.md for wiring.
// A = start/stop set toggle, B = stop + save session (see
// workout.svelte.ts `handleRemoteButton()`). GPIO-interrupt-driven; Button A
// also wakes the chip from light sleep.
#define BUTTON_A_PIN 32
#define BUTTON_B_PIN 33
const uint64_t BUTTON_DEBOUNCE_US = 250000ULL; // 250ms debounce, checked in the ISR

// Buzzer: warns when grip force (FSR) drops too low during an active set.
#define BUZZER_PIN 25
const int FSR_LOW_FORCE_THRESHOLD = 300;    // ADC counts (0-4095); below this = "losing grip"
const int FSR_LOW_FORCE_HYSTERESIS = 50;    // must rise above threshold+this to clear the alert
const float FSR_STABILITY_ALERT_THRESHOLD = 70.0f; // % from computeFsrStability(); below this = "not steady"
const unsigned long BUZZER_BEEP_INTERVAL_MS = 150; // on/off toggle period while alerting
const unsigned long BUZZER_ALERT_DELAY_MS = 3000;  // must stay flagged this long before it sounds

// 16x2 I2C LCD, same bus as MPU/MAX30102/MLX90614 (SDA=21, SCL=22). Run
// 01_i2c_scanner if 0x27 isn't the right address.
#define LCD_I2C_ADDR 0x27
#define LCD_COLS     16
#define LCD_ROWS     2
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS);

// MPU6050/6500-compatible raw driver -- talked to directly because this
// board's chip is actually an MPU6500 (WHO_AM_I 0x70), which
// Adafruit_MPU6050 rejects even though it's register-compatible.
#define MPU_ADDR             0x68
#define MPU_REG_WHO_AM_I     0x75
#define MPU_REG_PWR_MGMT_1   0x6B
#define MPU_REG_GYRO_CONFIG  0x1B
#define MPU_REG_ACCEL_CONFIG 0x1C
#define MPU_REG_ACCEL_XOUT_H 0x3B

// sEMG + FSR come from an Arduino Uno over UART (see uno_emg_fsr_link.cpp /
// PINS.md), not this board's own analogRead().
#define UNO_LINK_RX_PIN 16
#define UNO_LINK_TX_PIN 17
#define UNO_LINK_BAUD   9600

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

// Persistent HTTP client, reused across POSTs to avoid a ~80-110ms TCP
// handshake per send. Only touched from NetworkTask.
WiFiClient httpClient;
HTTPClient http;

bool statusMpu = false;
bool statusMax = false;
bool statusMlx = false;

// Sample sensors fast (100Hz, for waveform/integration fidelity) but POST at
// a lower rate to cut WiFi overhead. SensorTask is paced by a hardware timer;
// NetworkTask/LcdTask use vTaskDelayUntil().
const unsigned long SAMPLE_INTERVAL_MS = 10;  // 100 Hz local sensor sampling
const unsigned long SEND_INTERVAL_MS   = 250; // 4 Hz network send
const unsigned long LCD_UPDATE_INTERVAL_MS = 200; // 5 Hz
const unsigned long MLX_READ_INTERVAL_MS = 250;   // MLX90614 changes slowly
const unsigned long DEBUG_PRINT_INTERVAL_MS = 1000; // 1 Hz consolidated [SENSORS] log line

// EMG samples, 100Hz producer (SensorTask) / 250ms consumer (NetworkTask).
// Sized with 2x margin over the nominal 25 samples/cycle.
const int EMG_QUEUE_LEN = 64;

const unsigned long WATCHDOG_TIMEOUT_S = 5; // panic+reboot if a subscribed task is silent this long

// Light sleep ("sleep mode" requirement): only after 5+ min of genuine idle
// (no set ever started/reset, no button press) -- NOT during rest-between-sets,
// since HR/EMG must sample continuously during an active workout (see
// docs/sensor_usage.md). Set to 0 to disable if it's unstable with WiFi.
#define ENABLE_LIGHT_SLEEP 1
const unsigned long IDLE_SLEEP_TIMEOUT_MS = 5UL * 60UL * 1000UL; // 5 minutes fully idle
const uint64_t IDLE_WAKE_KEEPALIVE_US = 5ULL * 1000000ULL; // periodic wake so we're never stuck asleep forever

// Timer/interrupt/sleep behaviour is configured via bitmasks rather than
// scattered booleans, matching how the underlying APIs already think in bits
// (gpio_config_t.pin_bit_mask, esp_sleep_enable_*, timer edge/autoreload).
#define WAKE_SRC_TIMER (1 << 0) // periodic keepalive wake (esp_sleep_enable_timer_wakeup)
#define WAKE_SRC_EXT0  (1 << 1) // Button A wake (esp_sleep_enable_ext0_wakeup)
const uint8_t SLEEP_WAKE_SOURCE_MASK = WAKE_SRC_TIMER | WAKE_SRC_EXT0;

#define TIMER_CFG_EDGE_INTERRUPT (1 << 0) // 1 = edge-triggered ISR, 0 = level-triggered
#define TIMER_CFG_AUTORELOAD     (1 << 1) // 1 = alarm auto-reloads (periodic), 0 = one-shot
const uint8_t SAMPLE_TIMER_CONFIG_MASK = TIMER_CFG_EDGE_INTERRUPT | TIMER_CFG_AUTORELOAD;

#define BUTTON_BIT_A (1ULL << BUTTON_A_PIN) // GPIO32
#define BUTTON_BIT_B (1ULL << BUTTON_B_PIN) // GPIO33
const uint64_t BUTTON_PIN_BIT_MASK = BUTTON_BIT_A | BUTTON_BIT_B; // gpio_config_t.pin_bit_mask

// MPU-6050: pitch/roll + concentric velocity via leaky-integrated vertical
// acceleration (simplified VBT estimate, not lab-grade). Owned exclusively by
// SensorTask; only the published `shared` snapshot is visible to other tasks.
const float GRAVITY_MSS = 9.80665f;
const float VELOCITY_DECAY = 0.98f; // bleeds off drift each sample
float velocity = 0.0f, mpuPitch = 0.0f, mpuRoll = 0.0f;
float mpuAx = 0.0f, mpuAy = 0.0f, mpuAz = 0.0f;
unsigned long lastMpuMicros = 0;

int unoEmgVal = 0;
int unoFsrForce = 0;
unsigned long lastUnoRxMs = 0;
bool unoLinkWasOk = false; // edge-detect so the log line only prints on change

// MAX30102: beat detection -> BPM
const byte RATE_SIZE = 4;
byte bpmRates[RATE_SIZE];
byte bpmRateSpot = 0;
long lastBeat = 0;
int beatAvg = 0;
const long FINGER_PRESENT_IR_THRESHOLD = 50000;

// MAX30102: rough SpO2 estimate from a rolling Red/IR AC-DC ratio (not clinically accurate)
const int SPO2_WINDOW_SAMPLES = 200; // ~2s at the 100Hz fast-sample rate
int spo2SampleCount = 0;
long irMin = 0, irMax = 0, redMin = 0, redMax = 0;
float spo2Estimate = 98.0f;

// MLX90614: temperature delta vs. the skin temp measured at boot
float skinTempBaseline = 0.0f;
float skinTemp = 0.0f, deltaTemp = 0.0f;
unsigned long lastMlxReadMs = 0;
unsigned long lastDebugPrintMs = 0;

// FSR: grip stability (%) from the range of readings over a short rolling window
const int FSR_WINDOW_SAMPLES = 20;
int fsrHistory[FSR_WINDOW_SAMPLES];
int fsrHistoryIdx = 0;
bool fsrHistoryFull = false;

// Buzzer/button state -- owned exclusively by ControlTask.
bool buzzerOn = false;
unsigned long buzzerLastToggleMs = 0;
unsigned long fsrAlertConditionSinceMs = 0; // 0 = condition not currently met

// One struct + one mutex for both the sensor snapshot (written by SensorTask)
// and the workout/button state (written by ControlTask). Contention is low
// enough that one mutex is simpler than several.
struct SharedState {
  // Sensor snapshot -- written by SensorTask, read by NetworkTask/ControlTask/LcdTask.
  int fsrLatest = 0;
  float fsrStability = 100.0f;
  float mpuPitch = 0, mpuRoll = 0, velocity = 0;
  float mpuAx = 0, mpuAy = 0, mpuAz = 0;
  int beatAvg = 0;
  float spo2Estimate = 98.0f;
  float skinTemp = 0, deltaTemp = 0;

  // Workout/button control state -- written by ControlTask, read by LcdTask/NetworkTask.
  bool setActive = false;
  unsigned long setStartMs = 0;
  unsigned long restStartMs = 0;
  int setCount = 0;
  int repCount = 0; // local LCD-only counter; nothing increments this yet
  bool buttonAEventPending = false; // latched "pressed since last network send"; NetworkTask clears it
  bool buttonBEventPending = false;
  unsigned long lastActivityMs = 0; // last button press, for the idle/light-sleep timer
};
SharedState shared;
SemaphoreHandle_t stateMutex; // protects every field of `shared` above

// TwoWire isn't safe to call from two tasks concurrently, and the I2C bus is
// now touched from both SensorTask and LcdTask -- this mutex serializes it.
SemaphoreHandle_t i2cMutex;

QueueHandle_t emgQueue;         // int samples: SensorTask produces @100Hz, NetworkTask drains every 250ms
QueueHandle_t buttonEventQueue; // uint8_t button ids (0=A, 1=B): ISRs produce, ControlTask consumes

SemaphoreHandle_t sampleTickSemaphore; // given by the hardware timer ISR, taken by SensorTask
hw_timer_t *sampleTimer = nullptr;

TaskHandle_t sensorTaskHandle  = nullptr;
TaskHandle_t networkTaskHandle = nullptr;
TaskHandle_t lcdTaskHandle     = nullptr;
TaskHandle_t controlTaskHandle = nullptr;

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

// ISRs must be short and IRAM-resident -- no I2C/Serial/delay(), just a
// timestamp check and a hand-off into a queue/semaphore for the real task.
void IRAM_ATTR onSampleTimer() {
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  xSemaphoreGiveFromISR(sampleTickSemaphore, &xHigherPriorityTaskWoken);
  if (xHigherPriorityTaskWoken) portYIELD_FROM_ISR();
}

volatile int64_t lastButtonAIsrUs = 0;
volatile int64_t lastButtonBIsrUs = 0;

// Registered via gpio_isr_handler_add() instead of Arduino's attachInterrupt()
// -- gpio_isr_t takes a `void *arg`, unused here since each button has its
// own handler.
void IRAM_ATTR buttonA_isr(void *arg) {
  int64_t now = esp_timer_get_time();
  if (now - lastButtonAIsrUs < (int64_t)BUTTON_DEBOUNCE_US) return; // contact-bounce/double-tap guard
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

// Non-blocking reader for the "emg,fsr\n" lines the Uno sends every ~10ms.
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

  // No valid line in 500ms = link down (Uno unplugged/reset); keep last-known values.
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

// Beeps on/off while a set is active AND grip is weak or unsteady, once that
// condition holds for BUZZER_ALERT_DELAY_MS straight. Takes its inputs as
// parameters (read from `shared` by ControlTask) instead of touching globals.
void updateBuzzer(unsigned long now, int fsrLatest, float fsrStability, bool setActive) {
  static bool lowForce = false;
  if (lowForce) {
    if (fsrLatest > FSR_LOW_FORCE_THRESHOLD + FSR_LOW_FORCE_HYSTERESIS) lowForce = false;
  } else {
    if (fsrLatest < FSR_LOW_FORCE_THRESHOLD) lowForce = true;
  }

  bool unsteady = fsrStability < FSR_STABILITY_ALERT_THRESHOLD;
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

// Set number/status + a live timer, driven by the button state in `shared`
// (not the web app's own rep count/state, which it tracks independently).
void updateLcd(unsigned long now, bool setActive, unsigned long setStartMs, unsigned long restStartMs, int setCount) {
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

  // I2C bus is shared with SensorTask's sensor reads -- serialize.
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

// Reached from ControlTask's long-idle check. Tears down WiFi + the task
// watchdog first (its hardware timer keeps counting through the sleep, so
// leaving tasks subscribed would false-panic on wake), arms wake sources,
// then blocks until one fires.
void enterLightSleepUntilWake() {
  Serial.println("[POWER] Long idle detected -- entering light sleep.");

  if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    lcd.setCursor(0, 0); lcd.print("SLEEPING...     ");
    lcd.setCursor(0, 1); lcd.print("PRESS ANY BUTTON");
    xSemaphoreGive(i2cMutex);
  }

  WiFi.disconnect(true);

  esp_task_wdt_delete(sensorTaskHandle);
  esp_task_wdt_delete(networkTaskHandle);
  esp_task_wdt_delete(lcdTaskHandle);
  esp_task_wdt_delete(controlTaskHandle); // deletes self last
  esp_task_wdt_deinit();

  // Classic ESP32's ext1 multi-GPIO wake only supports "all pins low" or "any
  // pin high" -- neither fits two independent active-low buttons. So only
  // Button A (a valid RTC GPIO) wakes via ext0; Button B still works while
  // awake but can't wake the chip. Which sources actually arm is picked by
  // SLEEP_WAKE_SOURCE_MASK.
  if (SLEEP_WAKE_SOURCE_MASK & WAKE_SRC_EXT0) {
    esp_sleep_enable_ext0_wakeup((gpio_num_t)BUTTON_A_PIN, 0 /* wake on LOW = pressed */);
  }
  if (SLEEP_WAKE_SOURCE_MASK & WAKE_SRC_TIMER) {
    esp_sleep_enable_timer_wakeup(IDLE_WAKE_KEEPALIVE_US);
  }

  esp_light_sleep_start(); // <-- blocks here until a button press or the keepalive timer fires

  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  Serial.printf("[POWER] Woke from light sleep (cause=%d), resubscribing watchdog + reconnecting WiFi...\n", (int)cause);

  esp_task_wdt_init(WATCHDOG_TIMEOUT_S, true);
  esp_task_wdt_add(sensorTaskHandle);
  esp_task_wdt_add(networkTaskHandle);
  esp_task_wdt_add(lcdTaskHandle);
  esp_task_wdt_add(controlTaskHandle);

  connectWiFi();
}

// Core 1, prio 3 (highest): the 100Hz sampling loop, paced by the hardware
// timer's semaphore. Publishes a `shared` snapshot + an EMG sample each tick.
void sensorTask(void *pvParameters) {
  lastMpuMicros = micros();

  for (;;) {
    xSemaphoreTake(sampleTickSemaphore, portMAX_DELAY); // paced by onSampleTimer()'s hw timer ISR
    esp_task_wdt_reset();

    unsigned long now = millis();

    pollUnoLink(); // drains the UART buffer every tick so it never backs up

    int emgVal = unoEmgVal;
    int fsrVal = unoFsrForce;
    updateFsrStability(fsrVal);
    float stability = computeFsrStability();

    // Non-blocking push -- if the queue is momentarily full, drop the oldest
    // sample rather than ever blocking this 100Hz task.
    if (xQueueSend(emgQueue, &emgVal, 0) != pdTRUE) {
      int discarded;
      xQueueReceive(emgQueue, &discarded, 0);
      xQueueSend(emgQueue, &emgVal, 0);
    }

    long lastIrValue = 0, lastRedValue = 0;
    if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
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

      // MAX30102: HR (BPM) + SpO2. Reading straight from the FIFO
      // (getFIFOIR/getFIFORed + nextSample) is O(1), unlike the library's
      // blocking getIR()/getRed() wrappers.
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
              // 40-220 BPM keeps obvious noise (e.g. a motion-artifact "beat"
              // every 2s = 27 BPM) out of the rolling average.
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

      // MLX90614 changes slowly -- read independently of WiFi state so
      // skinTemp/deltaTemp keep updating while WiFi is down.
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

    // Publish this tick's readings for NetworkTask/ControlTask/LcdTask.
    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
      shared.fsrLatest = fsrVal;
      shared.fsrStability = stability;
      shared.mpuPitch = mpuPitch;
      shared.mpuRoll = mpuRoll;
      shared.velocity = velocity;
      shared.mpuAx = mpuAx;
      shared.mpuAy = mpuAy;
      shared.mpuAz = mpuAz;
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
        "MPU pitch=%.1f roll=%.1f vel=%.2f | HR=%d SpO2=%.1f%% | "
        "skinTemp=%.1fC dTemp=%.1fC | IR=%ld RED=%ld finger=%s\n",
        xPortGetCoreID(), emgVal, fsrVal, stability,
        mpuPitch, mpuRoll, velocity, beatAvg, spo2Estimate,
        skinTemp, deltaTemp, lastIrValue, lastRedValue,
        lastIrValue > FINGER_PRESENT_IR_THRESHOLD ? "yes" : "no");
    }
  }
}

// Core 0, prio 2: every 250ms, drains emgQueue into a batch, snapshots
// `shared`, POSTs the payload. On its own core so a slow POST never stalls
// SensorTask's 100Hz cadence.
void networkTask(void *pvParameters) {
  TickType_t lastWake = xTaskGetTickCount();

  for (;;) {
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(SEND_INTERVAL_MS));
    esp_task_wdt_reset();

    if (WiFi.status() != WL_CONNECTED) continue;

    char emgArray[400]; // generous margin over EMG_QUEUE_LEN worst-case 4-digit values
    int pos = snprintf(emgArray, sizeof(emgArray), "[");
    int sentBatchSize = 0;
    int sample;
    while (xQueueReceive(emgQueue, &sample, 0) == pdTRUE) {
      pos += snprintf(emgArray + pos, sizeof(emgArray) - pos, "%s%d", sentBatchSize == 0 ? "" : ",", sample);
      sentBatchSize++;
      if (pos >= (int)sizeof(emgArray) - 8) break; // guard against overflow if the queue was way behind
    }
    snprintf(emgArray + pos, sizeof(emgArray) - pos, "]");

    SharedState snap;
    bool sentButtonA = false, sentButtonB = false;
    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
      snap = shared;
      sentButtonA = shared.buttonAEventPending;
      sentButtonB = shared.buttonBEventPending;
      shared.buttonAEventPending = false; // one-shot event, cleared after being sent
      shared.buttonBEventPending = false;
      xSemaphoreGive(stateMutex);
    }

    char payload[768];
    snprintf(payload, sizeof(payload),
      "{\"board\":\"esp32\","
      "\"emg\":{\"raw\":%s},"
      "\"fsr\":{\"force\":%d,\"stability\":%.1f},"
      "\"mpu\":{\"pitch\":%.2f,\"roll\":%.2f,\"velocity\":%.3f,\"ax\":%.3f,\"ay\":%.3f,\"az\":%.3f},"
      "\"vitals\":{\"hr\":%d,\"spo2\":%.1f,\"skinTemp\":%.2f,\"deltaTemp\":%.2f},"
      "\"buttons\":{\"a\":%s,\"b\":%s}}",
      emgArray, snap.fsrLatest, snap.fsrStability,
      snap.mpuPitch, snap.mpuRoll, snap.velocity, snap.mpuAx, snap.mpuAy, snap.mpuAz,
      snap.beatAvg, snap.spo2Estimate, snap.skinTemp, snap.deltaTemp,
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
}

// Core 1, prio 1 (lowest): every 200ms, renders the set/rest timer snapshot.
// A missed frame here is harmless, unlike a missed sample or network send.
void lcdTask(void *pvParameters) {
  TickType_t lastWake = xTaskGetTickCount();

  for (;;) {
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(LCD_UPDATE_INTERVAL_MS));
    esp_task_wdt_reset();

    bool setActive;
    unsigned long setStartMs, restStartMs;
    int setCount;
    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) != pdTRUE) continue; // skip this frame rather than render a stale/torn read
    setActive = shared.setActive;
    setStartMs = shared.setStartMs;
    restStartMs = shared.restStartMs;
    setCount = shared.setCount;
    xSemaphoreGive(stateMutex);

    updateLcd(millis(), setActive, setStartMs, restStartMs, setCount);
  }
}

// Core 1, prio 2: consumes button events from the ISRs, owns the
// set/rest/button-latch state, re-evaluates the buzzer every wake, and
// triggers light sleep after a long enough genuine idle period.
void controlTask(void *pvParameters) {
  for (;;) {
    esp_task_wdt_reset();

    uint8_t buttonId;
    // Block up to 100ms for a button event; either way fall through below to
    // re-check the buzzer/idle conditions on a steady cadence.
    if (xQueueReceive(buttonEventQueue, &buttonId, pdMS_TO_TICKS(100)) == pdTRUE) {
      unsigned long pressNow = millis();
      if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        if (buttonId == 0) {
          // Button A: start/stop toggle
          shared.setActive = !shared.setActive;
          if (shared.setActive) {
            shared.setStartMs = pressNow;
            shared.setCount++;
          } else {
            shared.restStartMs = pressNow; // rest timer starts counting up from here
          }
          shared.buttonAEventPending = true;
        } else {
          // Button B: stop current set (if running) + reset
          shared.setActive = false;
          shared.restStartMs = pressNow;
          shared.repCount = 0;
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
    bool idleForSleep = false;
    unsigned long idleForMs = 0;

    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
      fsrLatest = shared.fsrLatest;
      fsrStability = shared.fsrStability;
      setActive = shared.setActive;
      if (!shared.setActive && shared.setCount == 0) {
        idleForMs = now - shared.lastActivityMs;
      }
      xSemaphoreGive(stateMutex);
    }
    updateBuzzer(now, fsrLatest, fsrStability, setActive);

#if ENABLE_LIGHT_SLEEP
    idleForSleep = idleForMs >= IDLE_SLEEP_TIMEOUT_MS;
    if (idleForSleep) {
      enterLightSleepUntilWake();
      if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
        // Reset the idle clock so a keepalive-timer wake (not a real button
        // press) doesn't immediately re-enter sleep in a tight loop.
        shared.lastActivityMs = millis();
        xSemaphoreGive(stateMutex);
      }
    }
#endif
  }
}

void setup() {
  Serial.begin(115200);
  delay(100); // let UART settle before any output

  // Button pin setup happens later via gpio_config()'s bitmask, not
  // pinMode(), since interrupt type is configured in the same call.
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  Serial2.begin(UNO_LINK_BAUD, SERIAL_8N1, UNO_LINK_RX_PIN, UNO_LINK_TX_PIN);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000); // conservative bus speed for breadboard/long-wire I2C

  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Booting...");

  // A device can ACK its address but still fail a register read right after
  // power-up; retry a few times with a short settle delay.
  for (int attempt = 0; attempt < 5 && !statusMpu; attempt++) {
    if (attempt > 0) delay(100);
    statusMpu = mpuBegin();
  }
  Serial.println(statusMpu ? "[I2C] MPU-6050/6500  (0x68) -> OK"
                            : "[I2C] MPU-6050/6500  (0x68) -> FAILED (velocity/pitch/roll will read 0)");

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

  // max30102.begin() silently switches the bus to fast clock -- put it back
  // to 100kHz before MLX90614/LCD/MPU use it.
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

  Serial.printf("[BOOT] Free heap before WiFi: %u bytes\n", esp_get_free_heap_size());
  connectWiFi();

  http.begin(httpClient, serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.setReuse(true); // keep the TCP connection open between POSTs
  Serial.printf("[BOOT] Free heap after WiFi init: %u bytes\n", esp_get_free_heap_size());

  // ---- RTOS primitives ----
  stateMutex = xSemaphoreCreateMutex();
  i2cMutex = xSemaphoreCreateMutex();
  sampleTickSemaphore = xSemaphoreCreateBinary();
  emgQueue = xQueueCreate(EMG_QUEUE_LEN, sizeof(int));
  buttonEventQueue = xQueueCreate(8, sizeof(uint8_t));

  shared.lastActivityMs = millis(); // don't start the idle/sleep clock before boot even finishes

  esp_task_wdt_init(WATCHDOG_TIMEOUT_S, true); // panic+reboot if a subscribed task goes silent

  // Both button pins configured in ONE gpio_config() call via the bitmask
  // BUTTON_PIN_BIT_MASK, instead of two pinMode()+attachInterrupt() calls.
  gpio_config_t buttonIoConf = {};
  buttonIoConf.pin_bit_mask = BUTTON_PIN_BIT_MASK;
  buttonIoConf.mode = GPIO_MODE_INPUT;
  buttonIoConf.pull_up_en = GPIO_PULLUP_ENABLE;
  buttonIoConf.pull_down_en = GPIO_PULLDOWN_DISABLE;
  buttonIoConf.intr_type = GPIO_INTR_NEGEDGE; // FALLING edge = pressed (active-low)
  gpio_config(&buttonIoConf);

  gpio_install_isr_service(0);
  gpio_isr_handler_add((gpio_num_t)BUTTON_A_PIN, buttonA_isr, nullptr);
  gpio_isr_handler_add((gpio_num_t)BUTTON_B_PIN, buttonB_isr, nullptr);

  // Hardware timer 0, 80MHz/80 prescaler = 1MHz tick (1us resolution),
  // replacing the old millis()-gate with a real timer/counter driving
  // SensorTask's cadence. Edge/autoreload picked from SAMPLE_TIMER_CONFIG_MASK.
  sampleTimer = timerBegin(0, 80, true);
  timerAttachInterrupt(sampleTimer, &onSampleTimer, (SAMPLE_TIMER_CONFIG_MASK & TIMER_CFG_EDGE_INTERRUPT) != 0);
  timerAlarmWrite(sampleTimer, SAMPLE_INTERVAL_MS * 1000, (SAMPLE_TIMER_CONFIG_MASK & TIMER_CFG_AUTORELOAD) != 0);
  timerAlarmEnable(sampleTimer);

  xTaskCreatePinnedToCore(sensorTask,  "SensorTask",  4096, nullptr, 3, &sensorTaskHandle,  1);
  xTaskCreatePinnedToCore(networkTask, "NetworkTask", 8192, nullptr, 2, &networkTaskHandle, 0);
  xTaskCreatePinnedToCore(lcdTask,     "LcdTask",     2560, nullptr, 1, &lcdTaskHandle,     1);
  xTaskCreatePinnedToCore(controlTask, "ControlTask", 2560, nullptr, 2, &controlTaskHandle, 1);

  esp_task_wdt_add(sensorTaskHandle);
  esp_task_wdt_add(networkTaskHandle);
  esp_task_wdt_add(lcdTaskHandle);
  esp_task_wdt_add(controlTaskHandle);

  Serial.printf("[BOOT] Free heap after task creation: %u bytes\n", esp_get_free_heap_size());
}

void loop() {
  // setup() already launched all 4 tasks -- delete this Arduino loopTask
  // outright instead of spinning an empty busy-loop.
  vTaskDelete(NULL);
}
