# 4.2 โครงสร้างซอฟต์แวร์และหน้าที่ของส่วนประกอบหลัก

## เฟิร์มแวร์

- `uno_emg_fsr_link/uno_emg_fsr_link.ino` — อ่าน EMG/FSR ด้วย ADC และส่ง UART
- `uno_emg_fsr_link/board_config.h` — กำหนดขาและช่วง ADC ของบอร์ด
- `esp32_workout_firmware/esp32_workout_firmware.ino` — รวมข้อมูลเซนเซอร์ จัดการ task, ปุ่ม, จอ, buzzer, Wi-Fi และ HTTP
- `esp32_workout_firmware/board_config.h` — กำหนด mapping I2C/ADC แบบหลายสถาปัตยกรรม

## เว็บและ API

- `frontend/src/routes/api/telemetry` — รับ telemetry และเปิด SSE
- `frontend/src/lib/server/telemetryStore.ts` — เก็บสถานะสด แปลงค่า และส่งต่อ backend
- `frontend/src/lib/workout/` — state ของ telemetry, workout, recording, calibration และกล้อง
- `backend/app/routers/` — endpoint authentication, telemetry, sessions, calibration และ users
- `backend/app/models/` — schema ข้อมูลที่รับและส่ง
- `backend/app/db.py` — client MongoDB และการสร้างดัชนี

แหล่งข้อมูล: โครงสร้างไฟล์ใน `backend/`, `frontend/` และสองโฟลเดอร์เฟิร์มแวร์ที่กำหนด
