# 10.3 แนวทางพัฒนาต่อ

- ปรับปรุง `PINS.md` และคู่มือใน `README.md` ให้ใช้ path และ pin mapping เดียวกับโค้ดปัจจุบัน
- เพิ่ม automated test สำหรับ parser UART, การแปลง calibration, telemetry schema และ endpoint authentication
- เพิ่มชุดข้อมูลอ้างอิงเพื่อประเมินความแม่นยำของ EMG, FSR, HR และ SpO2 อย่างเป็นระบบ
- แยกการตั้งค่า Wi-Fi, server URL และ secret ออกจาก source code พร้อมตรวจสอบการจัดการ credential
- ปรับการเก็บ telemetry ให้เหมาะกับปริมาณข้อมูลและความต้องการค้นย้อนหลัง รวมถึงกำหนด policy retention ให้ชัดเจน
- เพิ่มกลไกตรวจสอบความถูกต้องของ timestamp และการ reconnect ของอุปกรณ์
- พิจารณาปรับลิงก์ Uno-ESP32 ให้ไม่ชนกับ USB serial หรือเพิ่มโหมด debug ที่ไม่ปนกับข้อมูล telemetry

แนวทางเหล่านี้ต่อยอดจากข้อจำกัดและปัญหาที่ปรากฏใน source code, README และ troubleshooting โดยไม่สรุปว่าเป็นฟังก์ชันที่มีอยู่แล้วในระบบปัจจุบัน
