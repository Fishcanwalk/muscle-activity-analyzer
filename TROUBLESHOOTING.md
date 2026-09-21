# 🛠️ Troubleshooting Log — ESP32 + Uno Hardware Bring-up

บันทึกปัญหาที่เจอระหว่างอัปโหลดและทดสอบ [`test-sensor/src/esp32_workout_firmware.cpp`](test-sensor/src/esp32_workout_firmware.cpp) (ESP32) และ [`test-sensor/src/uno_emg_fsr_link.cpp`](test-sensor/src/uno_emg_fsr_link.cpp) (Arduino Uno) เรียงตามลำดับที่เจอจริง พร้อมอาการ สาเหตุ และวิธีแก้ ไว้อ้างอิงถ้าเจอซ้ำอีก

---

## 1. บรรทัดแรกของ Serial log ตัวอักษรเพี้ยนหลังบูต

**อาการ:** เปิด serial monitor แล้วบรรทัดแรกๆ หลังบูตมีตัวอักษรหาย/เพี้ยน (เช่น `requesFrom` แทนที่จะเป็น `requestFrom`) บรรทัดถัดไปอ่านออกปกติ

**สาเหตุ:** เรียก `Serial.begin(115200)` แล้วพิมพ์ข้อความทันทีโดยไม่รอ UART hardware settle ตัว boot-time I2C error log (มาจาก ESP-IDF เขียนตรงผ่าน UART คนละ path กับ Arduino `Serial`) ชนกับช่วงที่ baud/FIFO ยังไม่นิ่ง

**วิธีแก้:** เพิ่ม `delay(100)` ต่อจาก `Serial.begin(115200)` ใน `setup()` — ดู [esp32_workout_firmware.cpp:263](test-sensor/src/esp32_workout_firmware.cpp:263)

---

## 2. `pio device monitor` เปิดมาเจอตัวอักษรเพี้ยนเต็มจอ

**อาการ:** รัน `pio device monitor` เฉยๆ (ไม่ใส่ `-e` หรือ `-b`) แล้วได้ log เป็นกล่องตัวอักษรขยะ (mojibake) เต็มหน้าจอ

**สาเหตุ:** `pio device monitor` ที่ไม่ระบุ environment **ไม่ได้อ่านค่า `monitor_speed` จาก `platformio.ini` อัตโนมัติ** — default ของมันคือ **9600 baud** แต่ ESP32 พิมพ์ที่ **115200 baud** พอ baud ไม่ตรงกัน ข้อมูลก็ decode ผิดเพี้ยนหมด

**วิธีแก้:** ระบุ environment หรือ baud ให้ตรงเสมอ:
```bash
pio device monitor -e esp32_wifi_buttons
# หรือ
pio device monitor -b 115200
```

---

## 3. เซนเซอร์ I2C ทั้ง 3 ตัวหาไม่เจอพร้อมกัน (MPU-6050, MAX30102, MLX90614)

**อาการ:** log ขึ้น `i2cWriteReadNonStop returned Error -1` รัวๆ ทุกตัว, สแกน I2C ด้วย `01_i2c_scanner.cpp` ขึ้น "No I2C devices found"

**สาเหตุ:** สายต่อ SDA/SCL (GPIO21/GPIO22) หลุด/ต่อผิด — เพราะ error พร้อมกันทั้ง bus ไม่ใช่แค่ตัวเดียว บ่งชี้ปัญหาที่ bus รวม ไม่ใช่เซนเซอร์ตัวใดตัวหนึ่ง

**วิธีแก้:** ตรวจ/ต่อสาย SDA-GPIO21, SCL-GPIO22 ใหม่ให้แน่น ยืนยันด้วย `01_i2c_scanner.cpp` ว่าเจอครบ

---

## 4. MLX90614 หายไปจาก I2C bus แม้ตัวอื่นเจอปกติ

**อาการ:** สแกนซ้ำแล้ว MPU-6050 (0x68) กับ MAX30102 (0x57) เจอ แต่ MLX90614 (0x5A) ไม่เจอ

**สาเหตุ:** สาย VCC หรือ SDA/SCL เฉพาะของ MLX90614 หลวม/หลุด (ตัวอื่นบน bus เดียวกันยังทำงานได้ปกติ แปลว่า bus หลักไม่มีปัญหา)

**วิธีแก้:** เช็คจุดต่อเฉพาะของ MLX90614 ใหม่ให้แน่น

---

## 5. ESP32 auto-reset ไม่เข้าโหมด flash (`Wrong boot mode detected (0x13)` / `chip stopped responding`)

**อาการ:** สั่ง `pio run -t upload` แล้ว esptool ต่อชิปไม่ติด หรือบอกว่า boot mode ผิด เกิดขึ้นเป็นระยะตลอดเซสชัน

**สาเหตุ:** วงจร auto-reset (DTR/RTS) ของบอร์ดทำงานไม่เสถียร (พบได้บ่อยกับ USB-to-serial บางรุ่น)

**วิธีแก้:** reset เข้าโหมด download มือ:
1. กดปุ่ม **BOOT ค้างไว้**
2. **แตะปุ่ม EN/RESET แล้วปล่อย** (ระหว่างที่ยังกด BOOT อยู่)
3. รอ ~1 วิ แล้ว**ค่อยปล่อย BOOT** (ลำดับการปล่อยสำคัญ — ปล่อย EN ก่อน แล้วค่อยปล่อย BOOT)

---

## 6. Uno ↔ ESP32 UART link ไม่มีข้อมูลเข้าเลย (FSR ค้างที่ `raw=0`)

**อาการ:** ESP32 ไม่เคยพิมพ์ `[UART] Uno EMG/FSR link OK` แม้แต่ครั้งเดียว, `[FSR] raw=0` นิ่งตลอด ทั้งที่ยืนยันแล้วว่า Uno เองอ่าน sEMG/FSR และส่งออก TX ถูกต้อง (เช็คตรงจาก USB debug ของ Uno เจอค่าขยับปกติ)

**สาเหตุที่แท้จริง (พบ 2 อย่างซ้อนกัน):**
- **(a) ต่อสายผิดขา:** เดิมโค้ด [uno_emg_fsr_link.cpp](test-sensor/src/uno_emg_fsr_link.cpp) ใช้ `SoftwareSerial` บน pin 2(RX)/3(TX) ของ Uno โดยเจตนา (เว้น pin 0/1 ไว้ให้ USB debug ล้วนๆ) แต่ต่อสายจริงไปที่ pin 0/1 แทน ข้อมูลเลยไม่เคยออกไปที่สายจริง
- **(b) จุดต่อหลวม:** หลังแก้เป็น pin 0/1 ตามที่ต้องการ (ดูข้อ 7) ยังไม่มีข้อมูลเข้า ESP32 อยู่ดี ตรวจด้วย diagnostic sketch นับ byte ดิบ ([99_uart_raw_echo.cpp](test-sensor/src/99_uart_raw_echo.cpp)) พบว่า **ได้แค่ 1 byte ตลอดกาลแล้วหยุดสนิท** — ชี้ว่าสายเชื่อมถึงกันได้ (ไม่ใช่ขาดสนิท) แต่จุดต่อหลวม (จุดกึ่งกลาง voltage divider R1/R2 บนเบรดบอร์ดสัมผัสไม่แน่น)

**วิธีแก้:**
- (a) ย้ายสายจาก pin 0/1 → ตอนนี้แก้กลับด้านเดียวกัน คือปรับโค้ดให้ตรงกับที่ต่อจริง (ดูข้อ 7)
- (b) กดสาย/ขาตัวต้านทาน (R1=1kΩ, R2=2.2kΩ) ของ voltage divider ให้แน่นบนเบรดบอร์ดใหม่ทุกจุด — แก้แล้ว byte counter วิ่งขึ้นต่อเนื่อง ข้อมูล `<emg>,<fsr>\r\n` เข้ามาถูกต้อง

**เครื่องมือ diagnostic ที่ใช้เจาะปัญหานี้:** [99_uart_raw_echo.cpp](test-sensor/src/99_uart_raw_echo.cpp) — พิมพ์ raw byte ทุกตัวที่ได้รับบน GPIO16 ตรงๆ ไม่ผ่านการ parse บรรทัด `<emg>,<fsr>` เหมือน firmware หลัก ทำให้เห็นแม้สัญญาณจะเพี้ยน/มาไม่ครบ (ต่างจาก firmware หลักที่ทิ้งบรรทัด parse ไม่ผ่านแบบเงียบๆ)

---

## 7. เปลี่ยนจาก SoftwareSerial (pin 2/3) เป็น Hardware Serial (pin 0/1) บน Uno

**สิ่งที่ทำ:** ตามคำขอ ปรับ [uno_emg_fsr_link.cpp](test-sensor/src/uno_emg_fsr_link.cpp) ให้ใช้ Hardware `Serial` (pin 0 RX / pin 1 TX) แทน `SoftwareSerial` (pin 2/3) สำหรับลิงก์ไปหา ESP32 และตัดโค้ด debug print ที่เคยส่งออก USB ทิ้ง (เพราะตอนนี้ pin 0/1 ใช้ส่งข้อมูลจริงไปหา ESP32 แล้ว จะพิมพ์ debug ปนไปด้วยไม่ได้)

**ผลข้างเคียงที่ต้องรู้:**
- **ใช้ USB serial monitor ของ Uno พร้อมกับต่อสายไป ESP32 ไม่ได้อีกต่อไป** (พอร์ตเดียวกัน) ต้องเลือกอย่างใดอย่างหนึ่ง
- **ต้องถอดสาย pin 0/1 ออกก่อน upload โค้ดใหม่ทุกครั้ง** เพราะ upload ก็ใช้ pin 0/1 เหมือนกัน ต่อสายค้างไว้จะ upload ไม่ผ่าน

**หมายเหตุ:** เคยพิจารณาใช้ GPIO1/GPIO3 ฝั่ง ESP32 (UART0 — พอร์ตเดียวกับ USB debug/flash) แทน GPIO16/GPIO17 (Serial2) ตามที่ถามไว้ แต่ยังไม่ได้ทำเพราะจะเสีย debug log ผ่าน USB ไปเลยระหว่างต่อสาย และเสี่ยง flash โค้ดใหม่ไม่ผ่านถ้ามีอะไรค้างอยู่ที่ GPIO3 (RX0) ตอน upload — **ตอนนี้ฝั่ง ESP32 ยังใช้ GPIO16/17 (Serial2) เหมือนเดิม**

---

## ⚠️ สิ่งที่ยังไม่ได้อัปเดต

[PINS.md](PINS.md) ยังบันทึกไว้ว่า Uno ใช้ pin 2 (RX) / pin 3 (TX) แบบ SoftwareSerial สำหรับลิงก์นี้ — **ไม่ตรงกับโค้ดปัจจุบันแล้ว** (เปลี่ยนเป็น pin 0/1 Hardware Serial ตามข้อ 7) ต้องอัปเดตตารางในหัวข้อ "พินเชื่อมต่อ UART (ESP32 ↔ Uno)" ให้ตรงกับของจริงในรอบถัดไป
