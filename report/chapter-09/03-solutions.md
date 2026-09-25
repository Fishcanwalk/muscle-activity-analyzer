# 9.3 วิธีที่ใช้แก้ไขและเหตุผลที่เลือกวิธีนั้น

- เพิ่ม delay หลัง `Serial.begin()` ของ ESP32 เพื่อให้ UART settle ก่อนพิมพ์ log
- ระบุ environment หรือ baud ให้ `pio device monitor` ตรงกับ firmware
- ตรวจและต่อ SDA/SCL ใหม่ แล้วใช้ I2C scanner ยืนยัน address
- ตรวจ VCC/SDA/SCL ของ MLX90614 แยกจากอุปกรณ์อื่นเมื่ออุปกรณ์อื่นยังพบปกติ
- ใช้ขั้นตอนกด BOOT และ EN/RESET ด้วยมือเมื่อ auto-reset เข้า download mode ไม่สำเร็จ
- เปลี่ยน Uno ให้ใช้ Hardware Serial pin 0/1 ให้ตรงกับการต่อสายจริง และถอดสายก่อน upload
- กดจุดต่อ R1/R2 ของ voltage divider ให้แน่น แล้วใช้ raw echo ตรวจ byte ก่อนตรวจ parser

เหตุผลร่วมของวิธีเหล่านี้คือแยกตรวจทีละชั้น ตั้งแต่ physical link, baud/address, byte stream, parser และการทำงานของระบบ เพื่อไม่แก้ปัญหาผิดชั้น

แหล่งข้อมูล: `TROUBLESHOOTING.md`
