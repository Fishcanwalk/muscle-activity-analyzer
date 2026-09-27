# บทที่ 9 สรุปและแนวทางพัฒนา

## 9.1 สรุปสิ่งที่พัฒนาและผลที่ได้เทียบกับวัตถุประสงค์

โครงงานพัฒนาระบบครบเส้นทางตั้งแต่การอ่าน sEMG/FSR บน Uno การรวมเซนเซอร์บน ESP32 การส่งข้อมูลไปเว็บ การกระจายข้อมูลแบบสด การยืนยันตัวตน และการจัดเก็บข้อมูลใน MongoDB

ด้าน firmware มีการใช้ Timer1, ADC interrupt, watchdog และ sleep บน Uno ส่วน ESP32 ใช้ FreeRTOS task, hardware timer, GPIO interrupt, watchdog, I2C, UART และ HTTP ตามวัตถุประสงค์ที่กำหนดไว้ การแยกงานทำให้การอ่านเซนเซอร์ไม่ต้องรอการส่ง network โดยตรง

ด้านซอฟต์แวร์มี endpoint สำหรับ telemetry, SSE, recording, calibration, authentication และ session result ทำให้รองรับทั้งการดูข้อมูลสดและการเก็บผลสรุปหลังการฝึก

## 9.2 ข้อจำกัดของโครงงาน

1. ค่าที่แปลงจาก ADC เป็นหน่วย EMG และแรงเป็นค่าประมาณและขึ้นกับ gain/full-scale กับ calibration
2. SpO2 ใน firmware ระบุว่าเป็น rough estimate ไม่ใช่ค่าทางคลินิก
3. การนับครั้งจากกล้องขึ้นกับมุมกล้อง แสง และการมองเห็นแขน/ลำตัว
4. Recording slot ใน telemetry store เป็นทรัพยากรร่วมและรองรับการบันทึกจริงทีละรายการ
5. UART Uno ใช้ pin 0/1 จึงชนกับ USB serial และต้องถอดสายก่อน upload
6. `PINS.md` และบางส่วนของ `README.md` ยังมีข้อมูลเดิมที่ควรปรับให้ตรงกับโค้ดปัจจุบัน
7. รายงานแหล่งข้อมูลยังไม่มีผล validation เชิงตัวเลขสำหรับความแม่นยำของเซนเซอร์

## 9.3 แนวทางพัฒนาต่อ

- ปรับปรุง `PINS.md` และคู่มือใน `README.md` ให้ใช้ path และ pin mapping เดียวกับโค้ดปัจจุบัน
- เพิ่ม automated test สำหรับ parser UART, การแปลง calibration, telemetry schema และ endpoint authentication
- เพิ่มชุดข้อมูลอ้างอิงเพื่อประเมินความแม่นยำของ EMG, FSR, HR และ SpO2 อย่างเป็นระบบ
- แยกการตั้งค่า Wi-Fi, server URL และ secret ออกจาก source code พร้อมตรวจสอบการจัดการ credential
- ปรับการเก็บ telemetry ให้เหมาะกับปริมาณข้อมูลและความต้องการค้นย้อนหลัง รวมถึงกำหนด policy retention ให้ชัดเจน
- เพิ่มกลไกตรวจสอบความถูกต้องของ timestamp และการ reconnect ของอุปกรณ์
- พิจารณาปรับลิงก์ Uno-ESP32 ให้ไม่ชนกับ USB serial หรือเพิ่มโหมด debug ที่ไม่ปนกับข้อมูล telemetry

แนวทางเหล่านี้ต่อยอดจากข้อจำกัดและปัญหาที่ปรากฏใน source code, README และ troubleshooting โดยไม่สรุปว่าเป็นฟังก์ชันที่มีอยู่แล้วในระบบปัจจุบัน

แหล่งข้อมูล: `README.md`, `PINS.md`, `TROUBLESHOOTING.md`, `backend/`, `frontend/`, `frontend/src/lib/server/telemetryStore.ts`, `frontend/src/lib/workout/cameraRepCounter.svelte.ts`, โค้ด Arduino ทั้งสองโฟลเดอร์
