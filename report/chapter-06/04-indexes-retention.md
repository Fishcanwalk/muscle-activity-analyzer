# 6.4 ตัวอย่างเอกสาร ดัชนี การค้นคืน และอายุข้อมูล

backend สร้างดัชนีดังนี้

- `users.email` แบบ unique
- `refresh_tokens.jti` แบบ unique
- `calibrations.user_id` แบบ unique
- `session_results` ตาม `user_id` และ `created_at` เพื่อเรียงผลย้อนหลัง
- `session_results.session_id` เพื่อค้นตามเซสชัน
- `telemetry_samples` ตาม `user_id` และ `received_at` เพื่อค้นประวัติของผู้ใช้
- `telemetry_samples.received_at` แบบ TTL ตาม `TELEMETRY_RETENTION_DAYS` ซึ่งค่าเริ่มต้นใน settings คือ 90 วัน

ตัวอย่างการค้นคืน telemetry คือ query ด้วย `user_id` ของผู้ใช้ปัจจุบัน และถ้ามี `since` จะเปลี่ยนเป็นเงื่อนไข `received_at >= since` พร้อมจำกัดจำนวนผลไม่เกิน 2,000 รายการ ส่วน session history จำกัดค่าเริ่มต้น 50 และสูงสุด 200 รายการ

แหล่งข้อมูล: `backend/app/db.py`, `backend/app/config.py`, `backend/app/routers/telemetry.py`, `backend/app/routers/sessions.py`
