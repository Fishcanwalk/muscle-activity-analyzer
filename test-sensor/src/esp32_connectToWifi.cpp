#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ----------------------------------------------------
// ข้อมูลสำหรับล็อกอิน CoEIoT (WPA2-Personal)
// ----------------------------------------------------
const char* ssid     = "CoEIoT";
const char* password = "iot.coe.psu.ac.th";

// IP คอมพิวเตอร์ของคุณ (ดูจากคำสั่ง hostname -I บนคอม)
const char* serverUrl = "http://172.30.95.53:5173/api/telemetry";

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

void setup() {
  Serial.begin(115200);
  connectWiFi();
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    int emg_val = analogRead(34); // ขา sEMG บน ESP32
    int fsr_val = analogRead(35); // ขา FSR บน ESP32

    String payload = "{\"board\":\"esp32\",\"emg\":{\"raw\":" + String(emg_val) + "},\"fsr\":{\"force\":" + String(fsr_val) + "}}";
    
    int code = http.POST(payload);
    if (code > 0) {
      Serial.printf("Telemetry sent -> Code: %d\n", code);
    } else {
      Serial.printf("HTTP Error: %s\n", http.errorToString(code).c_str());
    }
    http.end();
  }
  delay(50); // 20 Hz
}