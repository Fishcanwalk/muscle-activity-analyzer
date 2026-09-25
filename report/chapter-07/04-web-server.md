# 7.4 เว็บและเซิร์ฟเวอร์: รับ telemetry, กระจาย SSE, เริ่ม/หยุดบันทึก, ส่งต่อ FastAPI และเก็บ MongoDB

Frontend route `POST /api/telemetry` รับ JSON จาก ESP32 แล้วเรียก `serverTelemetry.ingestFullTelemetry()` ส่วน `GET /api/telemetry/stream` ส่ง initial state และ event แบบ `telemetry` หรือ `button` ผ่าน SSE ให้ browser

`telemetryStore` เก็บ raw buffer และสถานะล่าสุด คำนวณ EMG/FSR ที่ใช้แสดงผล และเรียก `forwardToBackend()` เพื่อส่งข้อมูลไป FastAPI ด้วย service token ฝั่ง backend มี `POST /v1/telemetry` สำหรับ machine-to-machine และ `GET /v1/telemetry` สำหรับ history ของผู้ใช้ที่ login แล้ว

การเริ่ม/หยุดบันทึกใช้ `POST /api/recording` โดย frontend ตรวจสอบผู้ใช้ผ่าน FastAPI client และมี recording slot เดียวต่อ hardware rig ส่วน calibration proxy เรียก `GET/POST /v1/calibration` แล้ว mirror ค่ากลับเข้า in-memory store

FastAPI สร้าง index ตอนเริ่มแอปและใช้ Motor เชื่อม MongoDB การสร้าง session result เขียนลง `session_results` ขณะที่ telemetry เขียนลง `telemetry_samples`

แหล่งข้อมูล: `frontend/src/routes/api/telemetry/`, `frontend/src/routes/api/recording/+server.ts`, `frontend/src/routes/api/calibration/+server.ts`, `frontend/src/lib/server/telemetryStore.ts`, `backend/app/`
