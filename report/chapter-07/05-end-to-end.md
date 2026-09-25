# 7.5 เส้นทางข้อมูลแบบครบวงจรและตัวอย่างโค้ดสำคัญ

เส้นทางข้อมูลหนึ่งรอบเริ่มจาก `ISR(TIMER1_COMPA_vect)` ของ Uno ตั้ง flag → ADC interrupt อ่าน A0/A1 → `Serial.print()` ส่งข้อความ → ESP32 `pollUnoLink()` parse บรรทัด → `SensorTask` อัปเดต `SharedState` → `NetworkTask` สร้าง JSON → `http.POST(payload)` → frontend `ingestFullTelemetry()` → SSE และ `forwardToBackend()` → FastAPI insert MongoDB

ตัวอย่างจุดสำคัญที่ควรนำไปแสดงในรายงานฉบับเต็ม:

- การตั้ง Timer1 และ ADC ISR ใน `uno_emg_fsr_link.ino`
- การ parse `emg,fsr` และการอ่าน I2C ใน `esp32_workout_firmware.ino`
- การสร้าง telemetry payload ใน NetworkTask
- การ broadcast event ใน `frontend/src/routes/api/telemetry/stream/+server.ts`
- การ insert ใน `backend/app/routers/telemetry.py`

ใช้ [`../flowchart.md`](../flowchart.md) Flowchart 1 เป็นรูปสรุปเส้นทางข้อมูล และ Flowchart 2-3 เป็นรายละเอียดฝั่งไมโครคอนโทรลเลอร์

แหล่งข้อมูล: ไฟล์ที่ระบุในหัวข้อนี้ทั้งหมด และ `README.md`
