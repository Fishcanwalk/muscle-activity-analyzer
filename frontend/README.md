# Frontend (Svelte)

หน้าเว็บสำหรับบันทึกผลตรวจผู้ป่วยแต่ละครั้ง และเปรียบเทียบครั้งล่าสุดกับก่อนหน้า

```bash
npm install
npm run dev
```

เปิด http://localhost:5050 (มี proxy `/api` ไปที่ backend `http://localhost:5000` ตาม `vite.config.js`)

## สิ่งที่ยังไม่ทำในรอบนี้ (รอฮาร์ดแวร์ ESP32 จริง)
- `EmgLiveChart.svelte` / `ForceGauge.svelte` / `MotionCard.svelte` / `VitalsCard.svelte` ตาม SYSTEM_SPEC.md section 4 — หน้า Live Dashboard ที่ต้องรับข้อมูลสดจาก `GET /api/telemetry/live`
- Backend endpoint สำหรับ live telemetry มีพร้อมใช้แล้ว (`api_telemetry.py`) รอแค่ต่อ UI
