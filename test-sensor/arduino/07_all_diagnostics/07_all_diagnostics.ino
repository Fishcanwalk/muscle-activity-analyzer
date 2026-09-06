#include <MAX30105.h>
#include <heartRate.h>
#include <spo2_algorithm.h>

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include "board_config.h"

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

void mpuReadAccelG(float &ax, float &ay, float &az) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(MPU_REG_ACCEL_XOUT_H);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)6);
  int16_t rawX = (Wire.read() << 8) | Wire.read();
  int16_t rawY = (Wire.read() << 8) | Wire.read();
  int16_t rawZ = (Wire.read() << 8) | Wire.read();
  ax = rawX / 4096.0f; // +/-8g range -> 4096 LSB/g
  ay = rawY / 4096.0f;
  az = rawZ / 4096.0f;
}

// Sensor Objects
MAX30105          max30102;
Adafruit_MLX90614 mlx;

// Sensor Status Flags
bool status_mpu = false;
bool status_max = false;
bool status_mlx = false;

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Serial.println("\n========================================================");
  B_PRINTF("  Muscle Activity Analyzer - ALL SENSORS DIAGNOSTIC\n");
  B_PRINTF("  Target Board: %s\n", BOARD_TYPE_NAME);
  Serial.println("========================================================");

  // 1. Init ADC
  setupBoardAdc();
#if HAS_DUAL_ADC
  B_PRINTF("[ADC] sEMG: Pin %d | FSR: Pin %d (Max: %d)\n", EMG_PIN, FSR_PIN, ADC_MAX_VAL);
#else
  B_PRINTF("[ADC] ESP8266 Single ADC: Pin %d (Switch cable for EMG/FSR)\n", EMG_PIN);
#endif

  // 2. Init I2C
#if defined(ESP32) || defined(ESP8266)
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  B_PRINTF("[I2C] Initialized on SDA=%d, SCL=%d\n", I2C_SDA_PIN, I2C_SCL_PIN);
#else
  Wire.begin();
  B_PRINTF("[I2C] Initialized on Hardware SDA=A4, SCL=A5\n");
#endif

  // 3. Init MPU-6050/6500 (0x68)
  if (mpuBegin()) {
    status_mpu = true;
    Serial.println(" [1/3] MPU-6050  (0x68) -> ✅ OK");
  } else {
    Serial.println(" [1/3] MPU-6050  (0x68) -> ❌ FAILED");
  }

  // 4. Init MAX30102 (0x57)
  if (max30102.begin(Wire, I2C_SPEED_FAST)) {
    status_max = true;
    max30102.setup();
    max30102.setPulseAmplitudeRed(0x0A);
    Serial.println(" [2/3] MAX30102  (0x57) -> ✅ OK");
  } else {
    Serial.println(" [2/3] MAX30102  (0x57) -> ❌ FAILED");
  }

  // MAX30105::begin() bumps the I2C clock to 400kHz internally; MLX90614 breakout
  // boards (RC-filtered SMBus lines) often can't ACK reliably at that speed.
  Wire.setClock(100000);

  // 5. Init MLX90614 (0x5A)
  if (mlx.begin(0x5A, &Wire)) {
    status_mlx = true;
    Serial.println(" [3/3] MLX90614  (0x5A) -> ✅ OK");
  } else {
    Serial.println(" [3/3] MLX90614  (0x5A) -> ❌ FAILED");
  }

  Serial.println("--------------------------------------------------------");
  Serial.println("Starting continuous live readings...\n");
}

void loop() {
  // Read Analog
  int emg_val = analogRead(EMG_PIN);
#if HAS_DUAL_ADC
  int fsr_val = analogRead(FSR_PIN);
#else
  int fsr_val = emg_val; // ESP8266 shares single A0
#endif

  // Read MPU-6050/6500
  float pitch = 0, roll = 0;
  if (status_mpu) {
    float ax, ay, az;
    mpuReadAccelG(ax, ay, az);
    pitch = atan2(ay, sqrt(ax * ax + az * az)) * 180.0 / PI;
    roll  = atan2(-ax, az) * 180.0 / PI;
  }

  // Read MAX30102
  long ir_val = status_max ? max30102.getIR() : 0;
  bool finger = (ir_val > 50000);

  // Read MLX90614
  double skin_temp = status_mlx ? mlx.readObjectTempC() : 0.0;
  double amb_temp  = status_mlx ? mlx.readAmbientTempC() : 0.0;

  // Print Summary Status Line
  B_PRINTF("| EMG: %4d | FSR: %4d | Pitch: %5.1f° | Roll: %5.1f° | IR: %6ld [%s] | Skin: %4.1f°C | Amb: %4.1f°C |\n",
           emg_val, fsr_val, pitch, roll,
           ir_val, finger ? "Touch" : "Idle ",
           skin_temp, amb_temp);

  delay(300);
}
