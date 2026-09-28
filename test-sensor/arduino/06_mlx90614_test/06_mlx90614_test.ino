#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include "board_config.h"

Adafruit_MLX90614 mlx = Adafruit_MLX90614();

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Serial.println("\n==========================================");
  B_PRINTF("  MLX90614 Non-contact IR Thermometer Test\n");
  B_PRINTF("  Board: %s\n", BOARD_TYPE_NAME);
  Serial.println("==========================================");

#if defined(ESP32) || defined(ESP8266)
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
#else
  Wire.begin();
#endif

  // Keeps retrying instead of halting, so wiring can be reseated while watching the
  // Serial Monitor (and the message isn't lost if the monitor opened after boot).
  int attempt = 0;
  while (!mlx.begin(0x5A, &Wire)) {
    B_PRINTF("❌ MLX90614 not found at 0x5A (attempt %d). Check wiring / power...\n", ++attempt);
    delay(1000);
  }
  Serial.println("✅ MLX90614 Found and Initialized successfully!");
}

void loop() {
  double ambientTemp = mlx.readAmbientTempC();
  double objectTemp  = mlx.readObjectTempC();

  B_PRINTF("Ambient Temp: %.2f °C | Skin/Object Temp: %.2f °C\n",
           ambientTemp, objectTemp);

  delay(500);
}
