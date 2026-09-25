# 6.1 ภาพรวมข้อมูลสด ข้อมูลที่บันทึก และความสัมพันธ์ของข้อมูล

ข้อมูลสดเริ่มจาก ESP32 แล้วถูกเก็บชั่วคราวใน `ServerTelemetryState` ของ frontend เพื่อแสดงผลและกระจายผ่าน SSE ข้อมูลชุดนี้เป็นสถานะล่าสุด ไม่ใช่ประวัติถาวรทั้งหมด

เมื่อมีการส่งต่อไป backend จะเกิดเอกสารใน `telemetry_samples` โดยมี `received_at` และข้อมูลผู้ใช้/เซสชันตามที่ส่งมา ส่วนผลสรุปหลังจบเซตถูกส่งไป `session_results` และ calibration ถูกเก็บใน `calibrations` แยกจาก telemetry

ความสัมพันธ์หลักคือผู้ใช้หนึ่งคนมี calibration ของตนเอง มี telemetry ที่ใช้ติดตามช่วงเวลา และมีผลเซสชันหลายรายการที่อ้างอิง `session_id` ได้ ข้อมูล authentication ใช้ `users` และ `refresh_tokens` รองรับการเข้าถึงข้อมูลส่วนตัว

แหล่งข้อมูล: `backend/app/db.py`, `backend/app/routers/`, `backend/app/models/`, `frontend/src/lib/server/telemetryStore.ts`
