#include <Arduino.h>
#include <Wire.h>
#include "board_config.h"

// Target device addresses
#define ADDR_MPU6050  0x68
#define ADDR_MAX30102 0x57
#define ADDR_MLX90614 0x5A

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Serial.println("\n==========================================");
  B_PRINTF("  Multi-Board I2C Scanner\n");
  B_PRINTF("  Board: %s\n", BOARD_TYPE_NAME);
  B_PRINTF("  SDA Pin: %d | SCL Pin: %d\n", I2C_SDA_PIN, I2C_SCL_PIN);
  Serial.println("==========================================\n");

#if defined(ESP32) || defined(ESP8266)
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
#else
  Wire.begin(); // Arduino Uno uses hardware A4/A5
#endif
}

void loop() {
  byte error, address;
  int nDevices = 0;
  bool found_mpu = false;
  bool found_max = false;
  bool found_mlx = false;

  Serial.println("Scanning I2C bus...");

  for (address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    error = Wire.endTransmission();

    if (error == 0) {
      B_PRINTF(" [+] Found I2C device at 7-bit address 0x%02X", address);

      if (address == ADDR_MPU6050) {
        Serial.print("  <-- MPU-6050 (Motion IMU) [OK]");
        found_mpu = true;
      } else if (address == 0x69) {
        Serial.print("  <-- MPU-6050 with AD0=HIGH (Motion IMU)");
        found_mpu = true;
      } else if (address == ADDR_MAX30102) {
        Serial.print("  <-- MAX30102 (Pulse Oximeter) [OK]");
        found_max = true;
      } else if (address == ADDR_MLX90614) {
        Serial.print("  <-- MLX90614 (IR Temperature) [OK]");
        found_mlx = true;
      }
      Serial.println();
      nDevices++;
    } else if (error == 4) {
      B_PRINTF(" [!] Unknown error at address 0x%02X\n", address);
    }
  }

  Serial.println("------------------------------------------");
  if (nDevices == 0) {
    Serial.println("❌ No I2C devices found! Check wiring, pull-ups, and power.");
  } else {
    B_PRINTF("Total devices found: %d\n", nDevices);
    B_PRINTF(" - MPU-6050  (0x68): %s\n", found_mpu ? "✅ CONNECTED" : "❌ NOT FOUND");
    B_PRINTF(" - MAX30102  (0x57): %s\n", found_max ? "✅ CONNECTED" : "❌ NOT FOUND");
    B_PRINTF(" - MLX90614  (0x5A): %s\n", found_mlx ? "✅ CONNECTED" : "❌ NOT FOUND");
  }
  Serial.println("==========================================\n");

  delay(4000);
}
