# 📌 ESP32 Pinout — Muscle Activity Analyzer

พินทั้งหมดที่ใช้บน **ESP32 DevKit (3.3V Logic)** สำหรับเฟิร์มแวร์ในโฟลเดอร์ [`test-sensor/src/`](test-sensor/src/) โดยเฉพาะไฟล์ `esp32_connectToWifi.cpp` และไฟล์ที่แตกออกมาจากมัน

ที่มาของค่าพิน: [`test-sensor/include/board_config.h`](test-sensor/include/board_config.h)

## เซนเซอร์ (ของเดิม)

| สัญญาณ | GPIO | โหมด | หมายเหตุ |
| :--- | :--- | :--- | :--- |
| I2C SDA | **GPIO 21** | I2C | ใช้ร่วมกันทั้ง MPU-6050/6500, MAX30102, MLX90614 (ต้องมี Pull-up 4.7kΩ ไปที่ 3.3V) |
| I2C SCL | **GPIO 22** | I2C | ใช้ร่วมกันกับทั้ง 3 เซนเซอร์ I2C ด้านบน |
| sEMG (Analog) | **GPIO 34** | ADC1 CH6, `analogRead` | อ่านค่าไฟฟ้ากล้ามเนื้อ, ADC1 ใช้ร่วมกับ WiFi ได้ปกติ |
| FSR (Analog) | **GPIO 35** | ADC1 CH7, `analogRead` | อ่านค่าแรงกด, ADC1 ใช้ร่วมกับ WiFi ได้ปกติ |

> ⚠️ ห้ามใช้ ADC2 (GPIO 0, 2, 4, 12–15, 25–27) สำหรับ `analogRead` ขาใหม่ๆ ถ้าโปรแกรมเปิด WiFi ไว้ (ตัว ESP32 มีข้อจำกัดว่า ADC2 ใช้ร่วมกับ WiFi ไม่ได้) — แต่ใช้เป็น digital input/output (เช่นปุ่มกด) ได้ตามปกติ

## ปุ่มกด (ของใหม่ — สำหรับไฟล์ทดสอบปุ่ม)

| สัญญาณ | GPIO | โหมด | หมายเหตุ |
| :--- | :--- | :--- | :--- |
| Button A | **GPIO 32** | Digital Input, `INPUT_PULLUP` | ต่อขาปุ่มอีกด้านลง **GND**; กดแล้วอ่านได้ `LOW` |
| Button B | **GPIO 33** | Digital Input, `INPUT_PULLUP` | ต่อขาปุ่มอีกด้านลง **GND**; กดแล้วอ่านได้ `LOW` |

การต่อสาย: ขาปุ่มด้านหนึ่งเข้า GPIO ที่กำหนด อีกด้านเข้า GND โดยตรง ไม่ต้องมีตัวต้านทานภายนอกเพราะเปิด internal pull-up ไว้ในซอฟต์แวร์แล้ว (ค่าเริ่มต้น = `HIGH`, กดปุ่ม = `LOW`)

เลือก GPIO 32/33 เพราะเป็นขาที่ยังว่าง ไม่ชนกับ I2C/ADC ของเซนเซอร์เดิม และรองรับ `INPUT_PULLUP` ได้ตามปกติ

### พฤติกรรมบนเว็บ (ผ่าน telemetry POST ที่มีอยู่แล้ว — ไม่มี endpoint ใหม่)

เฟิร์มแวร์ตรวจจับ "ขอบการกด" (press edge, debounce 250ms) แล้วแนบ `"buttons":{"a":true/false,"b":true/false}` เข้าไปในแพ็กเก็ต telemetry ที่ POST ไป `/api/telemetry` ทุก 100ms อยู่แล้ว ฝั่งเว็บ (`telemetryStore.ts` → SSE `/api/telemetry/stream` → `telemetry.svelte.ts` → `workout.svelte.ts` `handleRemoteButton()`) จะแปลงเป็น action เดียวกับที่ปุ่มบนหน้าเว็บทำ:

- **ปุ่ม A (GPIO 32)** — วนครบ 3 สถานะเหมือนกดเมาส์ 2 ครั้ง: กด 1 = เริ่มเซต, กด 2 = จบเซต (ไปหน้าสรุปผล), กด 3 = เริ่มเซตถัดไปทันที (ข้ามการกด "เริ่มเซตถัดไป" อีกครั้ง)
- **ปุ่ม B (GPIO 33)** — จบเซตปัจจุบัน (ถ้ากำลังทำอยู่) แล้วบันทึกผลเซสชันทันที เหมือนกด "จบเซต & ดูสรุปผล" ต่อด้วย "บันทึกผลเซสชันวันนี้"

`repCount`/LCD ไม่เกี่ยวกับสองปุ่มนี้ (ดูหัวข้อจอแสดงผลด้านล่าง) — รอบนี้ยังไม่ได้ทำช่องทางย้อนกลับให้ ESP32 ดึงค่า rep จริงจากเว็บมาโชว์

## จอแสดงผล (LCD)

| อุปกรณ์ | บัส | Address | หมายเหตุ |
| :--- | :--- | :--- | :--- |
| LCD 16x2 (I2C, PCF8574 backpack) | I2C (ใช้บัสเดียวกับ MPU/MAX30102/MLX90614: SDA=**GPIO 21**, SCL=**GPIO 22**) | `0x27` (ค่าเริ่มต้น) | ถ้าจอไม่ติด ให้รันสเก็ตช์ `01_i2c_scanner` หาแอดเดรสจริง (มักเป็น `0x27` หรือ `0x3F`) แล้วแก้ `LCD_I2C_ADDR` ในไฟล์ |

Library: `marcoschwartz/LiquidCrystal_I2C` (ประกาศไว้เฉพาะ env `esp32_wifi_buttons` ใน `platformio.ini`)

เนื้อหาที่แสดงบนจอ (อัปเดตทุก 200ms):
- **บรรทัด 1:** `REP:<จำนวนครั้ง>` — ค่าหลักที่ต้องมีตามที่ขอ
- **บรรทัด 2:** `V:<ความเร็วขึ้น m/s> HR:<ชีพจร bpm>` — ความเร็วช่วงยก (VBT, จาก MPU) และอัตราการเต้นหัวใจ (จาก MAX30102) เพราะเป็น 2 ค่าที่บอกได้ทันทีว่า "เร็บนี้เป็นยังไง" และ "พร้อมเซ็ตต่อไปหรือยัง" โดยไม่ต้องเปิดหน้าเว็บดู

## ไฟล์ที่เกี่ยวข้อง

- [`test-sensor/src/esp32_connectToWifi.cpp`](test-sensor/src/esp32_connectToWifi.cpp) — เฟิร์มแวร์หลัก (WiFi + 6 เซนเซอร์)
- [`test-sensor/src/esp32_connectToWifi_buttons.cpp`](test-sensor/src/esp32_connectToWifi_buttons.cpp) — สำเนาของไฟล์ข้างบน + ปุ่ม 2 ปุ่ม + จอ LCD แสดง REP/Velocity/HR (ปุ่มยังไม่ผูก logic เพิ่ม/ลด REP รอกำหนดพฤติกรรมเพิ่มเติม)
