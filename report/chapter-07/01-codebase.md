# 7.1 แผนผัง codebase และหน้าที่ของเฟิร์มแวร์ เว็บ และ API

```text
test-sensor/arduino/
├── uno_emg_fsr_link/              # Uno: ADC + Timer1 + UART
└── esp32_workout_firmware/        # ESP32: FreeRTOS + I2C + Wi-Fi + HTTP

frontend/src/
├── routes/api/                    # endpoint รับ telemetry, SSE, recording, calibration
├── lib/server/telemetryStore.ts   # สถานะสดและการส่งต่อ backend
└── lib/workout/                   # state ของ workout, telemetry, camera, recording

backend/app/
├── routers/                       # auth, telemetry, sessions, calibration, users
├── models/                        # schema ข้อมูล
├── db.py                          # MongoDB และ index
└── security.py                    # JWT และ password
```

ผังนี้เป็นสรุปหน้าที่ของส่วนประกอบหลัก ไม่ได้รวมไฟล์ที่อยู่นอกขอบเขตแหล่งข้อมูลของรายงาน

แหล่งข้อมูล: โครงสร้างไฟล์ใน `backend/`, `frontend/` และ `test-sensor/arduino/`
