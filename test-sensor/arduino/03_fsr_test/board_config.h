#ifndef BOARD_CONFIG_H
#define BOARD_CONFIG_H

#include <Arduino.h>

// ==============================================================================
// 1. Automatic Architecture Detection & Pin Mapping
// ==============================================================================

#if defined(ESP32)
  // ---------------- ESP32 Configuration ----------------
  #define BOARD_TYPE_NAME   "ESP32 DevKit (3.3V Logic)"
  #define I2C_SDA_PIN       21
  #define I2C_SCL_PIN       22
  #define EMG_PIN           34    // ADC1 CH6
  #define FSR_PIN           35    // ADC1 CH7
  #define FSR_DIGITAL_PIN   27    // D0 (digital threshold output)
  #define ADC_MAX_VAL       4095  // 12-bit ADC
  #define SYSTEM_VCC        3.3f
  #define HAS_DUAL_ADC      1

  inline void setupBoardAdc() {
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db); // 0 - 3.3V
  }

#elif defined(ESP8266)
  // ---------------- ESP8266 Configuration ----------------
  #define BOARD_TYPE_NAME   "ESP8266 NodeMCU / D1 Mini (3.3V Logic)"
  #define I2C_SDA_PIN       4     // D2
  #define I2C_SCL_PIN       5     // D1
  #define EMG_PIN           A0    // ESP8266 มี ADC Pin เดียว (A0)
  #define FSR_PIN           A0    // สลับเสียบสาย A0 เมื่อต้องการทดสอบ FSR
  #define FSR_DIGITAL_PIN   D5    // D0 (digital threshold output)
  #define ADC_MAX_VAL       1023  // 10-bit ADC
  #define SYSTEM_VCC        3.3f
  #define HAS_DUAL_ADC      0

  inline void setupBoardAdc() {
    // ESP8266 default is 10-bit 0-1.0V (or 0-3.3V on NodeMCU with onboard divider)
  }

#elif defined(ARDUINO_ARCH_AVR)
  // ---------------- Arduino Uno / Nano (ATmega328P) ----------------
  #define BOARD_TYPE_NAME   "Arduino Uno / Nano (5.0V Logic)"
  #define I2C_SDA_PIN       A4    // Fixed Hardware I2C SDA
  #define I2C_SCL_PIN       A5    // Fixed Hardware I2C SCL
  #define EMG_PIN           A0
  #define FSR_PIN           A1
  #define FSR_DIGITAL_PIN   7     // D0 (digital threshold output)
  #define ADC_MAX_VAL       1023  // 10-bit ADC
  #define SYSTEM_VCC        5.0f
  #define HAS_DUAL_ADC      1

  inline void setupBoardAdc() {
    // AVR default is 10-bit with 5V VCC reference
  }

#else
  #error "Unsupported Microcontroller Architecture! Supported: ESP32, ESP8266, Arduino Uno (AVR)"
#endif

// ==============================================================================
// 2. Cross-Platform Printf Helper (Supports AVR Serial without native printf)
// ==============================================================================

#if defined(ARDUINO_ARCH_AVR)
  #include <stdarg.h>
  inline void boardPrintf(const char *fmt, ...) {
    char buf[128];
    va_list args;
    va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);
    Serial.print(buf);
  }
  #define B_PRINTF boardPrintf
#else
  #define B_PRINTF Serial.printf
#endif

#endif // BOARD_CONFIG_H
