# 8.2 กรณีทดสอบและเกณฑ์ประเมินผล

| กรณี | วิธีตรวจ | เกณฑ์ผ่าน |
|---|---|---|
| Uno อ่าน ADC | เปลี่ยนสัญญาณที่ A0/A1 และดูข้อความ UART | ได้คู่ค่า `emg,fsr` ต่อเนื่องและรูปแบบถูกต้อง |
| UART Uno-ESP32 | ต่อผ่าน voltage divider และดู log ESP32 | ESP32 parse ค่าได้ ไม่ค้างที่ศูนย์ |
| Timer/ADC | ตรวจความต่อเนื่องของข้อมูลและรอบอ่าน | ไม่มีการหยุดยาวจน watchdog reset |
| I2C | ใช้ scanner และตรวจ log ตอนเริ่มระบบ | พบ address ของอุปกรณ์ที่ต่ออยู่ |
| HTTP telemetry | ตรวจ response ของ `/api/telemetry` | ได้ JSON response และ packet count เพิ่ม |
| SSE | เปิดหน้า dashboard และถอด/ต่อ network | สถานะเปลี่ยนและ reconnect ได้ |
| Authentication | เรียก endpoint แบบมี/ไม่มี token | endpoint ส่วนตัวปฏิเสธ request ที่ไม่มี token |
| Calibration | GET/POST calibration ของผู้ใช้ | ค่าถูกบันทึกและสะท้อนใน live conversion |
| Session result | จบเซตและบันทึกผล | ผลถูกสร้างและค้นย้อนหลังได้ |

เกณฑ์นี้เป็นกรอบสำหรับทดสอบจากโค้ดและ endpoint ที่มีอยู่ ไม่ใช่ผลการรับรองความแม่นยำของเซนเซอร์

แหล่งข้อมูล: `backend/app/routers/`, `frontend/src/routes/api/`, `TROUBLESHOOTING.md`, `README.md`
