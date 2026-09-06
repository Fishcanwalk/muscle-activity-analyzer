#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_MLX90614.h>
#include "MAX30105.h"
#include "board_config.h"

// Sensor Objects
Adafruit_MPU6050  mpu;
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

  // 3. Init MPU-6050 (0x68)
  if (mpu.begin(0x68, &Wire)) {
    status_mpu = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
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

  // Read MPU-6050
  float pitch = 0, roll = 0;
  if (status_mpu) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    pitch = atan2(a.acceleration.y, sqrt(a.acceleration.x * a.acceleration.x + a.acceleration.z * a.acceleration.z)) * 180.0 / PI;
    roll  = atan2(-a.acceleration.x, a.acceleration.z) * 180.0 / PI;
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
