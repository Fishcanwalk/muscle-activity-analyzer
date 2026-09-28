# บทที่ 5 การจัดเก็บข้อมูลและการนำไปใช้

## 5.1 ภาพรวมข้อมูลสด ข้อมูลที่บันทึก และความสัมพันธ์ของข้อมูล

ข้อมูลสดเริ่มจาก ESP32 แล้วถูกเก็บชั่วคราวใน `ServerTelemetryState` ของ frontend เพื่อแสดงผลและกระจายผ่าน WebSocket (EMG) และ SSE (เซนเซอร์อื่น) ข้อมูลชุดนี้เป็นสถานะล่าสุด ไม่ใช่ประวัติถาวรทั้งหมด

เมื่อมีการส่งต่อไป backend จะเกิดเอกสารใน `telemetry_samples` โดยมี `received_at` และข้อมูลผู้ใช้/เซสชันตามที่ส่งมา ส่วนผลสรุปหลังจบเซตถูกส่งไป `session_results` และ calibration ถูกเก็บใน `calibrations` แยกจาก telemetry

ความสัมพันธ์หลักคือผู้ใช้หนึ่งคนมี calibration ของตนเอง มี telemetry ที่ใช้ติดตามช่วงเวลา และมีผลเซสชันหลายรายการที่อ้างอิง `session_id` ได้ ข้อมูล authentication ใช้ `users` และ `refresh_tokens` รองรับการเข้าถึงข้อมูลส่วนตัว

ดูแผนภาพความสัมพันธ์ระหว่าง collection ทั้งหมดได้ที่ [`../db-diagram.md`](../db-diagram.md)

## 5.2 Collections และฟิลด์สำคัญ

| Collection | ฟิลด์สำคัญ | หน้าที่ |
|---|---|---|
| `users` | email, name, password_hash, roles, is_active, created_at | บัญชีผู้ใช้ |
| `refresh_tokens` | jti, user_id, revoked, created_at, expires_at | token สำหรับต่ออายุ session |
| `telemetry_samples` | emg, fsr, mpu, vitals, device, timestamp, user_id, session_id, received_at | ข้อมูลเซนเซอร์ที่รับเข้า |
| `session_results` | setNumber, exercise, weightKg, totalReps, cleanReps, cheatedReps, reps, session_id, user_id, created_at | ผลสรุปการฝึก |
| `calibrations` | user_id, emgBaseline, emgMvc, fsrZero, fsrMax, updated_at | ค่า calibration ต่อผู้ใช้ |

ชื่อและฟิลด์ข้างต้นมาจากการสร้าง index, Pydantic models และ router ของ backend โดยตรง

## 5.3 เก็บข้อมูลแต่ละประเภทเพื่อใช้ทำอะไร และส่วนใดของระบบเรียกใช้จริง

- **telemetry สด** ใช้โดย `telemetryStore` เพื่อคำนวณหน่วย แสดงแดชบอร์ด และส่ง event ไป browser
- **telemetry ที่บันทึกใน MongoDB** ใช้เป็นประวัติข้อมูลตามช่วงเวลา โดย endpoint history สามารถค้นตาม `since` และ `limit`
- **session results** ใช้แสดงผลหลังจบเซตและประวัติการฝึก โดย query ได้ตามผู้ใช้และ `session_id`
- **calibration** ใช้ทั้งในหน้า calibration และใน telemetry store เพื่อแปลง raw ADC เป็นค่าที่แสดงผล
- **users และ refresh tokens** ใช้ยืนยันตัวตนและจำกัดการเข้าถึงข้อมูลของแต่ละผู้ใช้

การบันทึกการวัดแบบละเอียดกับการบันทึกผลสรุปถูกแยกกัน เพื่อให้หน้าใช้งานอ่านผลเซตได้ง่ายโดยไม่ต้องประมวลผล telemetry ทั้งหมดใหม่

## 5.4 ตัวอย่างเอกสาร ดัชนี การค้นคืน และอายุข้อมูล

backend สร้างดัชนีดังนี้

- `users.email` แบบ unique
- `refresh_tokens.jti` แบบ unique
- `calibrations.user_id` แบบ unique
- `session_results` ตาม `user_id` และ `created_at` เพื่อเรียงผลย้อนหลัง
- `session_results.session_id` เพื่อค้นตามเซสชัน
- `telemetry_samples` ตาม `user_id` และ `received_at` เพื่อค้นประวัติของผู้ใช้
- `telemetry_samples.received_at` แบบ TTL ตาม `TELEMETRY_RETENTION_DAYS` ซึ่งค่าเริ่มต้นใน settings คือ 90 วัน

ตัวอย่างการค้นคืน telemetry คือ query ด้วย `user_id` ของผู้ใช้ปัจจุบัน และถ้ามี `since` จะเปลี่ยนเป็นเงื่อนไข `received_at >= since` พร้อมจำกัดจำนวนผลไม่เกิน 2,000 รายการ ส่วน session history จำกัดค่าเริ่มต้น 50 และสูงสุด 200 รายการ

แหล่งข้อมูล: `backend/app/db.py`, `backend/app/routers/`, `backend/app/models/`, `frontend/src/lib/server/telemetryStore.ts`, `backend/app/routers/telemetry.py`, `backend/app/routers/sessions.py`, `backend/app/routers/calibration.py`, `frontend/src/lib/workout/`, `backend/app/config.py`
