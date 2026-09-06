# Muscle Activity Analyzer

ระบบตรวจวัดและวิเคราะห์การทำงานของกล้ามเนื้อและการตอบสนองทางสรีรวิทยาแบบครบวงจร (Multi-modal Physiological & Biomechanical Monitoring System)

## 📌 สถาปัตยกรรมและการไหลของข้อมูล
`ESP32 (C++) -> Flask REST API -> MongoDB`  
`MongoDB -> Flask REST API -> Svelte Frontend (Polling 200-500ms)`

## 📖 เอกสารข้อกำหนดระบบ (Specification)
ดูรายละเอียดทั้งหมดของสถาปัตยกรรม, ผังวงจรฮาร์ดแวร์, โครงสร้างโฟลเดอร์, API Spec และ Schema ได้ที่:
👉 **[SYSTEM_SPEC.md](SYSTEM_SPEC.md)**

## 📦 การติดตั้ง Dependencies และสภาพแวดล้อม (Setup Guide)
คู่มือการติดตั้งโปรแกรม, Extension, การตั้งค่าพอร์ต USB บน Ubuntu และไลบรารีทั้งหมด:
👉 **[DEPENDENCIES.md](DEPENDENCIES.md)**

## 🚀 การรันเว็บบันทึกผล & เปรียบเทียบความก้าวหน้าผู้ป่วย

ยังไม่ต้องมี ESP32 จริงก็ทดลองได้ทันที (มีฟอร์มกรอกมือ + mock data):

```bash
# 1. เริ่ม MongoDB + Backend (Flask)
docker-compose up -d
# Backend อยู่ที่ http://localhost:5001 (พอร์ต 5000 เว้นไว้เพราะชนกับ macOS AirPlay Receiver)

# 2. สร้างข้อมูลผู้ป่วย mock (ครั้งแรกครั้งเดียว)
docker exec muscle_analyzer_backend python -m app.seed.seed_mock_data

# 3. รัน Frontend (Svelte)
cd frontend
npm install
npm run dev
# เปิด http://localhost:5050
```

ฟีเจอร์ปัจจุบัน:
- รายชื่อผู้ป่วย → บันทึก log ผลตรวจแต่ละครั้งด้วยฟอร์ม (มือ) หรือ **Live Session** (รับข้อมูล real-time แล้วเซฟอัตโนมัติ) → เปรียบเทียบครั้งล่าสุดกับก่อนหน้าอัตโนมัติ (ลูกศร ↑/↓ + กราฟแนวโน้ม)
- **Live Session:** กด "เริ่ม Live Session" ในหน้าผู้ป่วย ตั้ง Device ID (เช่น `SIM_USER_001`) แล้วยิงข้อมูลจำลองแทน ESP32 จริงด้วย:
  ```bash
  python backend/scripts/simulate_esp32.py --device-id SIM_USER_001 --duration 20
  ```
  จะเห็นตัวเลข + กราฟ EMG สดอัปเดตทุก 300ms กด "หยุด & บันทึกเป็น Log" เพื่อเซฟเป็น session ทันที (พอมี ESP32 จริงก็เปลี่ยนจากรันสคริปต์นี้เป็นให้ ESP32 ยิง `POST /api/telemetry` เข้ามาที่ device_id เดียวกันแทนได้เลย ไม่ต้องแก้โค้ดฝั่งเว็บ)
