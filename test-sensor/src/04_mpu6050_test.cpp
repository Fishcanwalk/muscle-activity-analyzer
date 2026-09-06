#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include "board_config.h"

Adafruit_MPU6050 mpu;

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

  if (!mpu.begin(0x68, &Wire)) {
    Serial.println("❌ Failed to find MPU6050 chip at address 0x68!");
    Serial.println("Check SDA/SCL wiring or check if AD0 is connected to 3.3V (which changes addr to 0x69).");
    while (1) delay(100);
  }
  Serial.println("✅ MPU6050 Found and Initialized successfully!");

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  // Calculate simple Pitch and Roll from Accelerometer
  float pitch = atan2(a.acceleration.y, sqrt(a.acceleration.x * a.acceleration.x + a.acceleration.z * a.acceleration.z)) * 180.0 / PI;
  float roll  = atan2(-a.acceleration.x, a.acceleration.z) * 180.0 / PI;

  B_PRINTF("Accel [m/s^2]: (%.2f, %.2f, %.2f) | Pitch: %.1f deg, Roll: %.1f deg | Temp: %.1f C\n",
           a.acceleration.x, a.acceleration.y, a.acceleration.z,
           pitch, roll, temp.temperature);

  delay(200);
}
