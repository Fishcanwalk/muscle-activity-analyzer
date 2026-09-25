# 4.3 การพัฒนาฟังก์ชันหลักและการเชื่อมต่อระหว่างส่วนประกอบ

การเชื่อมต่อเริ่มจาก UART ระหว่าง Uno กับ ESP32 โดย Uno ส่งข้อความหนึ่งบรรทัดต่อรอบอ่าน และ ESP32 อ่านจนพบ newline แล้ว parse เป็นจำนวนเต็มสองค่า จากนั้น ESP32 รวมกับข้อมูล I2C และสร้าง JSON telemetry

Frontend route `/api/telemetry` รับ JSON และเรียก `ingestFullTelemetry()` เพื่ออัปเดตสถานะสด เมื่อมีข้อมูลใหม่จะ broadcast event `telemetry` ให้ browser และเรียก `forwardToBackend()` เพื่อส่งต่อไป FastAPI

การปรับเทียบใช้ frontend route `/api/calibration` เป็น proxy ที่ตรวจสอบผู้ใช้ เรียก backend และอัปเดต cache ใน telemetry store ให้การแปลงหน่วยของข้อมูลสดใช้ค่าเดียวกับค่าที่บันทึกไว้ ส่วนผลเซตใช้ route ของ FastAPI ผ่าน client ที่สร้างใน frontend

แหล่งข้อมูล: `frontend/src/routes/api/telemetry/+server.ts`, `frontend/src/routes/api/calibration/+server.ts`, `frontend/src/lib/server/telemetryStore.ts`, `backend/app/routers/telemetry.py`, `backend/app/routers/calibration.py`
