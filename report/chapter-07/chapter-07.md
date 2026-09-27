# บทที่ 7 โครงสร้างและการทำงานของโค้ด

## 7.1 แผนผัง codebase และหน้าที่ของเฟิร์มแวร์ เว็บ และ API

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

## 7.2 Arduino Uno: Timer1, ADC Interrupt, Watchdog และ UART

เฟิร์มแวร์ `uno_emg_fsr_link.ino` ใช้ Timer1 ในโหมด CTC โดยตั้ง prescaler 64 และค่า OCR1A ให้เกิด interrupt ที่ 100 Hz หรือทุก 10 ms เมื่อเกิด `TIMER1_COMPA_vect` จะตั้ง `FLAG_TIMER_TICK` ให้ loop เริ่มรอบอ่านใหม่

การอ่าน ADC ไม่ใช้ `analogRead()` แบบรอค้าง แต่เปิด ADC complete interrupt และเริ่ม conversion ที่ A0 สำหรับ EMG เมื่อเสร็จจะเก็บค่าและเริ่ม A1 สำหรับ FSR ต่อทันที เมื่อ FSR เสร็จ loop จะคัดลอกค่าด้วยช่วง `cli()`/`sei()` แล้วกลับด้าน FSR เพราะเซนเซอร์อ่านค่าสูงตอนพัก

CPU ใช้ `SLEEP_MODE_IDLE` ระหว่างรอ timer และ ADC interrupt ส่วน watchdog ตั้งไว้ 2 วินาทีและ reset เมื่อจบรอบอ่านครบ หากรอบอ่านไม่เดินต่อจะ reset อุปกรณ์

ค่าที่ได้จาก ADC 10-bit ถูก map เป็น 0-4095 แล้วส่งด้วย `Serial` ที่ 9600 baud เป็นรูปแบบ `emg,fsr` ต่อบรรทัด ผ่าน pin 0/1 ของ Uno ตามโค้ดปัจจุบัน

ใช้ [`../flowchart.md`](../flowchart.md) Flowchart 2 เป็นรูปประกอบหัวข้อนี้

## 7.3 ESP32: FreeRTOS, Hardware Timer, GPIO Interrupt, Watchdog, I2C และการส่งข้อมูล

ESP32 แยกงานเป็น `SensorTask`, `NetworkTask`, `LcdTask` และ `ControlTask` ด้วย `xTaskCreatePinnedToCore()` โดย SensorTask อ่านข้อมูลถี่ที่สุด, NetworkTask ส่ง HTTP ทุก 250 ms, LcdTask อัปเดตจอทุก 200 ms และ ControlTask จัดการปุ่มกับสถานะการฝึก

hardware timer ใช้ปลุก semaphore ของรอบ sampling ที่ 100 Hz ส่วนปุ่ม GPIO32 และ GPIO33 ใช้ interrupt handler ส่ง event เข้า `buttonEventQueue` โดยใช้ตัวจับเวลาไมโครวินาทีเพื่อทำ debounce 250 ms ปุ่ม A ยังเป็น wake source ในโหมด light sleep ตามข้อจำกัดของบอร์ด

watchdog ของ ESP32 ตั้ง timeout 5 วินาทีและเพิ่ม task หลักเข้า watchdog แต่ละ task เรียก `esp_task_wdt_reset()` หลังทำงาน ส่วนการอ่าน MPU, MAX30102, MLX90614 และ LCD ใช้ I2C bus ที่ SDA21/SCL22 และมี mutex ป้องกันการใช้งานร่วมกัน

ข้อมูลจาก Uno อ่านผ่าน `Serial2` ที่ GPIO16/17 และ 9600 baud จากนั้น NetworkTask จะรวมข้อมูลใน JSON แล้วใช้ `HTTPClient.POST()` ส่งไปยัง URL ของ frontend

ใช้ [`../flowchart.md`](../flowchart.md) Flowchart 3 เป็นรูปประกอบหัวข้อนี้

## 7.4 เว็บและเซิร์ฟเวอร์: รับ telemetry, กระจาย SSE, เริ่ม/หยุดบันทึก, ส่งต่อ FastAPI และเก็บ MongoDB

Frontend route `POST /api/telemetry` รับ JSON จาก ESP32 แล้วเรียก `serverTelemetry.ingestFullTelemetry()` ส่วน `GET /api/telemetry/stream` ส่ง initial state และ event แบบ `telemetry` หรือ `button` ผ่าน SSE ให้ browser

`telemetryStore` เก็บ raw buffer และสถานะล่าสุด คำนวณ EMG/FSR ที่ใช้แสดงผล และเรียก `forwardToBackend()` เพื่อส่งข้อมูลไป FastAPI ด้วย service token ฝั่ง backend มี `POST /v1/telemetry` สำหรับ machine-to-machine และ `GET /v1/telemetry` สำหรับ history ของผู้ใช้ที่ login แล้ว

การเริ่ม/หยุดบันทึกใช้ `POST /api/recording` โดย frontend ตรวจสอบผู้ใช้ผ่าน FastAPI client และมี recording slot เดียวต่อ hardware rig ส่วน calibration proxy เรียก `GET/POST /v1/calibration` แล้ว mirror ค่ากลับเข้า in-memory store

FastAPI สร้าง index ตอนเริ่มแอปและใช้ Motor เชื่อม MongoDB การสร้าง session result เขียนลง `session_results` ขณะที่ telemetry เขียนลง `telemetry_samples`

## 7.5 เส้นทางข้อมูลแบบครบวงจรและตัวอย่างโค้ดสำคัญ

เส้นทางข้อมูลหนึ่งรอบเริ่มจาก `ISR(TIMER1_COMPA_vect)` ของ Uno ตั้ง flag → ADC interrupt อ่าน A0/A1 → `Serial.print()` ส่งข้อความ → ESP32 `pollUnoLink()` parse บรรทัด → `SensorTask` อัปเดต `SharedState` → `NetworkTask` สร้าง JSON → `http.POST(payload)` → frontend `ingestFullTelemetry()` → SSE และ `forwardToBackend()` → FastAPI insert MongoDB

ตัวอย่างจุดสำคัญที่ควรนำไปแสดงในรายงานฉบับเต็ม:

- การตั้ง Timer1 และ ADC ISR ใน `uno_emg_fsr_link.ino`
- การ parse `emg,fsr` และการอ่าน I2C ใน `esp32_workout_firmware.ino`
- การสร้าง telemetry payload ใน NetworkTask
- การ broadcast event ใน `frontend/src/routes/api/telemetry/stream/+server.ts`
- การ insert ใน `backend/app/routers/telemetry.py`

ใช้ [`../flowchart.md`](../flowchart.md) Flowchart 1 เป็นรูปสรุปเส้นทางข้อมูล และ Flowchart 2-3 เป็นรายละเอียดฝั่งไมโครคอนโทรลเลอร์

แหล่งข้อมูล: โครงสร้างไฟล์ใน `backend/`, `frontend/` และ `test-sensor/arduino/`, `test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino`, `test-sensor/arduino/uno_emg_fsr_link/board_config.h`, `test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino`, `test-sensor/arduino/esp32_workout_firmware/board_config.h`, `PINS.md`, `TROUBLESHOOTING.md`, `frontend/src/routes/api/telemetry/`, `frontend/src/routes/api/recording/+server.ts`, `frontend/src/routes/api/calibration/+server.ts`, `frontend/src/lib/server/telemetryStore.ts`, `backend/app/`, `README.md`
