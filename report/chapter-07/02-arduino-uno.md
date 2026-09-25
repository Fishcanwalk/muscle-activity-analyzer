# 7.2 Arduino Uno: Timer1, ADC Interrupt, Watchdog และ UART

เฟิร์มแวร์ `uno_emg_fsr_link.ino` ใช้ Timer1 ในโหมด CTC โดยตั้ง prescaler 64 และค่า OCR1A ให้เกิด interrupt ที่ 100 Hz หรือทุก 10 ms เมื่อเกิด `TIMER1_COMPA_vect` จะตั้ง `FLAG_TIMER_TICK` ให้ loop เริ่มรอบอ่านใหม่

การอ่าน ADC ไม่ใช้ `analogRead()` แบบรอค้าง แต่เปิด ADC complete interrupt และเริ่ม conversion ที่ A0 สำหรับ EMG เมื่อเสร็จจะเก็บค่าและเริ่ม A1 สำหรับ FSR ต่อทันที เมื่อ FSR เสร็จ loop จะคัดลอกค่าด้วยช่วง `cli()`/`sei()` แล้วกลับด้าน FSR เพราะเซนเซอร์อ่านค่าสูงตอนพัก

CPU ใช้ `SLEEP_MODE_IDLE` ระหว่างรอ timer และ ADC interrupt ส่วน watchdog ตั้งไว้ 2 วินาทีและ reset เมื่อจบรอบอ่านครบ หากรอบอ่านไม่เดินต่อจะ reset อุปกรณ์

ค่าที่ได้จาก ADC 10-bit ถูก map เป็น 0-4095 แล้วส่งด้วย `Serial` ที่ 9600 baud เป็นรูปแบบ `emg,fsr` ต่อบรรทัด ผ่าน pin 0/1 ของ Uno ตามโค้ดปัจจุบัน

ใช้ [`../flowchart.md`](../flowchart.md) Flowchart 2 เป็นรูปประกอบหัวข้อนี้

แหล่งข้อมูล: `test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino`, `test-sensor/arduino/uno_emg_fsr_link/board_config.h`, `PINS.md`, `TROUBLESHOOTING.md`
