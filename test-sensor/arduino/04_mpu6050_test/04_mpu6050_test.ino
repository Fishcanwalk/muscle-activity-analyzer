#include <Arduino.h>
#include <Wire.h>
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
#define MPU_REG_TEMP_OUT_H   0x41

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

float mpuReadTempC() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(MPU_REG_TEMP_OUT_H);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)2);
  int16_t raw = (Wire.read() << 8) | Wire.read();
  return raw / 333.87f + 21.0f; // MPU6500 die-temp formula
}

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Serial.println("\n==========================================");
  B_PRINTF("  MPU-6050 6-Axis Motion Test\n");
  B_PRINTF("  Board: %s\n", BOARD_TYPE_NAME);
  B_PRINTF("  I2C Pins: SDA=%d, SCL=%d\n", I2C_SDA_PIN, I2C_SCL_PIN);
  Serial.println("==========================================");

#if defined(ESP32) || defined(ESP8266)
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
#else
  Wire.begin();
#endif

  if (!mpuBegin()) {
    Serial.println("❌ Failed to find MPU6050/6500 chip at address 0x68!");
    Serial.println("Check SDA/SCL wiring or check if AD0 is connected to 3.3V (which changes addr to 0x69).");
    while (1) delay(100);
  }
  Serial.println("✅ MPU6050/6500 Found and Initialized successfully!");
}

void loop() {
  float ax, ay, az;
  mpuReadAccelMs2(ax, ay, az);

  // Calculate simple Pitch and Roll from Accelerometer
  float pitch = atan2(ay, sqrt(ax * ax + az * az)) * 180.0 / PI;
  float roll  = atan2(-ax, az) * 180.0 / PI;
  float tempC = mpuReadTempC();

  B_PRINTF("Accel [m/s^2]: (%.2f, %.2f, %.2f) | Pitch: %.1f deg, Roll: %.1f deg | Temp: %.1f C\n",
           ax, ay, az, pitch, roll, tempC);

  delay(200);
}
