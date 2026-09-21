#include <Arduino.h>

// Diagnostic only: prints every raw byte received on GPIO16 (ESP32 RX2) to
// the USB Serial Monitor, unparsed. Used to check whether ANY signal is
// arriving from the Uno link at all, independent of whether it forms valid
// "<emg>,<fsr>\n" lines.
#define UNO_LINK_RX_PIN 16
#define UNO_LINK_TX_PIN 17
#define UNO_LINK_BAUD   9600

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial2.begin(UNO_LINK_BAUD, SERIAL_8N1, UNO_LINK_RX_PIN, UNO_LINK_TX_PIN);
  Serial.println("[RAW] Listening on GPIO16 (RX2) at 9600 baud...");
}

unsigned long lastByteMs = 0;
unsigned long byteCount = 0;

void loop() {
  while (Serial2.available()) {
    int b = Serial2.read();
    byteCount++;
    lastByteMs = millis();
    if (b >= 32 && b < 127) {
      Serial.write((char)b);
    } else {
      Serial.printf("[0x%02X]", b);
    }
  }

  static unsigned long lastReport = 0;
  if (millis() - lastReport >= 2000) {
    lastReport = millis();
    Serial.printf("\n[RAW] total bytes so far: %lu (last byte %lums ago)\n",
      byteCount, byteCount ? millis() - lastByteMs : 0);
  }
}
