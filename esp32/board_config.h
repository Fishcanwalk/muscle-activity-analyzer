#ifndef BOARD_CONFIG_H
#define BOARD_CONFIG_H


#if defined(ESP32)
  #define BOARD_TYPE_NAME   "ESP32 DevKit (3.3V Logic)"
  #define I2C_SDA_PIN       21
  #define I2C_SCL_PIN       22
  #define EMG_PIN           34    // ADC1 CH6
  #define FSR_PIN           35    // ADC1 CH7
  #define ADC_MAX_VAL       4095  // 12-bit ADC
  #define SYSTEM_VCC        3.3f
  #define HAS_DUAL_ADC      1

  inline void setupBoardAdc() {
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db); // 0 - 3.3V
  }

#else
  #error "ESP32!!"
#endif
