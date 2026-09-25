# 6.2 Collections และฟิลด์สำคัญ

| Collection | ฟิลด์สำคัญ | หน้าที่ |
|---|---|---|
| `users` | email, name, password_hash, roles, is_active, created_at | บัญชีผู้ใช้ |
| `refresh_tokens` | jti, user_id, revoked, created_at, expires_at | token สำหรับต่ออายุ session |
| `telemetry_samples` | emg, fsr, mpu, vitals, device, timestamp, user_id, session_id, received_at | ข้อมูลเซนเซอร์ที่รับเข้า |
| `session_results` | setNumber, exercise, weightKg, totalReps, cleanReps, cheatedReps, reps, session_id, user_id, created_at | ผลสรุปการฝึก |
| `calibrations` | user_id, emgBaseline, emgMvc, fsrZero, fsrMax, updated_at | ค่า calibration ต่อผู้ใช้ |

ชื่อและฟิลด์ข้างต้นมาจากการสร้าง index, Pydantic models และ router ของ backend โดยตรง

แหล่งข้อมูล: `backend/app/db.py`, `backend/app/models/`, `backend/app/routers/`
