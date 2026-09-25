# 3.1 ภาพรวมสถาปัตยกรรมและองค์ประกอบของระบบ

ระบบแบ่งเป็น 4 ชั้นหลัก

1. **ชั้นเซนเซอร์และเฟิร์มแวร์** — Uno อ่าน sEMG/FSR และ ESP32 รวมข้อมูลจาก Uno กับเซนเซอร์ I2C
2. **ชั้นรับข้อมูลของเว็บ** — SvelteKit รับ HTTP POST จาก ESP32 เก็บสถานะสดใน `telemetryStore` และกระจายด้วย SSE
3. **ชั้น API และฐานข้อมูล** — FastAPI ตรวจสอบ token รับ telemetry ผลเซสชัน และ calibration แล้วเก็บใน MongoDB
4. **ชั้นผู้ใช้** — หน้า Svelte แสดงค่าร่างกาย กราฟ สถานะอุปกรณ์ กล้อง และผลการฝึก

ภาพรวมการเชื่อมต่ออยู่ใน [`../flowchart.md`](../flowchart.md) Flowchart 1

แหล่งข้อมูล: `README.md`, `backend/app/main.py`, `frontend/src/routes/api/`, `test-sensor/arduino/`
