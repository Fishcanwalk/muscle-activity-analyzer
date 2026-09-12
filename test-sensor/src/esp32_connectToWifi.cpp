#include <Arduino.h>
#include <WiFi.h>
#include "esp_wpa2.h"
#include <HTTPClient.h>

// ----------------------------------------------------
// ข้อมูลสำหรับล็อกอิน COEwifi (WPA2-Enterprise PEAP)
// ----------------------------------------------------
#define EAP_IDENTITY  "6710110151"      // Username หรือ รหัสนักศึกษา
#define EAP_USERNAME  "6710110151"      // Username หรือ รหัสนักศึกษา
#define EAP_PASSWORD  "Mh@P0ng_62"   // รหัสผ่าน PSU Passport
const char* ssid    = "COEwifi";

// IP คอมพิวเตอร์ของคุณ (ดูจากคำสั่ง hostname -I บนคอม)
const char* serverUrl = "http://172.30.80.14:5173/api/telemetry"; 

void connectEnterpriseWiFi() {
  Serial.println("\n[WiFi] Setting up WPA2-Enterprise for COEwifi...");
  
  WiFi.disconnect(true);
  WiFi.mode(WIFI_STA);

  // กำหนดค่า WPA2-Enterprise (EAP-PEAP / MSCHAPv2)
  esp_wifi_sta_wpa2_ent_set_identity((uint8_t *)EAP_IDENTITY, strlen(EAP_IDENTITY));
  esp_wifi_sta_wpa2_ent_set_username((uint8_t *)EAP_USERNAME, strlen(EAP_USERNAME));
  esp_wifi_sta_wpa2_ent_set_password((uint8_t *)EAP_PASSWORD, strlen(EAP_PASSWORD));
  esp_wifi_sta_wpa2_ent_enable();

  WiFi.begin(ssid);

  Serial.print("[WiFi] Connecting to COEwifi");
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 40) {
    delay(500);
    Serial.print(".");
    retry++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] ✅ Connected to COEwifi successfully!");
    Serial.print("[WiFi] ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] ❌ Failed to connect to COEwifi. Please verify credentials.");
  }
}

void setup() {
  Serial.begin(115200);
  connectEnterpriseWiFi();
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