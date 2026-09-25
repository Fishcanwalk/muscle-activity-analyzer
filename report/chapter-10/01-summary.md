# 10.1 สรุปสิ่งที่พัฒนาและผลที่ได้เทียบกับวัตถุประสงค์

โครงงานพัฒนาระบบครบเส้นทางตั้งแต่การอ่าน sEMG/FSR บน Uno การรวมเซนเซอร์บน ESP32 การส่งข้อมูลไปเว็บ การกระจายข้อมูลแบบสด การยืนยันตัวตน และการจัดเก็บข้อมูลใน MongoDB

ด้าน firmware มีการใช้ Timer1, ADC interrupt, watchdog และ sleep บน Uno ส่วน ESP32 ใช้ FreeRTOS task, hardware timer, GPIO interrupt, watchdog, I2C, UART และ HTTP ตามวัตถุประสงค์ที่กำหนดไว้ การแยกงานทำให้การอ่านเซนเซอร์ไม่ต้องรอการส่ง network โดยตรง

ด้านซอฟต์แวร์มี endpoint สำหรับ telemetry, SSE, recording, calibration, authentication และ session result ทำให้รองรับทั้งการดูข้อมูลสดและการเก็บผลสรุปหลังการฝึก

แหล่งข้อมูล: `README.md`, `backend/`, `frontend/`, โค้ด Arduino ทั้งสองโฟลเดอร์
