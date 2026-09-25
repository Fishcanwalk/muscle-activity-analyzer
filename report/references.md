# เอกสารอ้างอิง

เอกสารอ้างอิงในรายงานฉบับนี้เป็นไฟล์ภายในโครงการที่ผู้ใช้กำหนดให้ใช้เป็นแหล่งข้อมูล

1. `README.md` — ภาพรวมระบบ การติดตั้ง และสถาปัตยกรรมระดับโครงการ
2. `PINS.md` — การกำหนดขาและรายละเอียดการต่ออุปกรณ์
3. `TROUBLESHOOTING.md` — บันทึกปัญหาและวิธีแก้ระหว่าง bring-up
4. `test-sensor/arduino/uno_emg_fsr_link/` — firmware ของ Arduino Uno สำหรับ ADC และ UART
5. `test-sensor/arduino/esp32_workout_firmware/` — firmware ของ ESP32 สำหรับเซนเซอร์ I2C, FreeRTOS, Wi-Fi และ HTTP
6. `backend/` — FastAPI, models, security, MongoDB และ routers
7. `frontend/` — SvelteKit routes, telemetry store, workout state และส่วนติดต่อผู้ใช้

รายงานนี้ไม่ได้เพิ่มแหล่งข้อมูลภายนอกเพื่ออธิบายการทำงานของโค้ด
