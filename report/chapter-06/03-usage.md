# 6.3 เก็บข้อมูลแต่ละประเภทเพื่อใช้ทำอะไร และส่วนใดของระบบเรียกใช้จริง

- **telemetry สด** ใช้โดย `telemetryStore` เพื่อคำนวณหน่วย แสดงแดชบอร์ด และส่ง event ไป browser
- **telemetry ที่บันทึกใน MongoDB** ใช้เป็นประวัติข้อมูลตามช่วงเวลา โดย endpoint history สามารถค้นตาม `since` และ `limit`
- **session results** ใช้แสดงผลหลังจบเซตและประวัติการฝึก โดย query ได้ตามผู้ใช้และ `session_id`
- **calibration** ใช้ทั้งในหน้า calibration และใน telemetry store เพื่อแปลง raw ADC เป็นค่าที่แสดงผล
- **users และ refresh tokens** ใช้ยืนยันตัวตนและจำกัดการเข้าถึงข้อมูลของแต่ละผู้ใช้

การบันทึกการวัดแบบละเอียดกับการบันทึกผลสรุปถูกแยกกัน เพื่อให้หน้าใช้งานอ่านผลเซตได้ง่ายโดยไม่ต้องประมวลผล telemetry ทั้งหมดใหม่

แหล่งข้อมูล: `backend/app/routers/telemetry.py`, `backend/app/routers/sessions.py`, `backend/app/routers/calibration.py`, `frontend/src/lib/workout/`
