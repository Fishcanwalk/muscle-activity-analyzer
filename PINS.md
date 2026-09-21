# 📌 ESP32 Pinout — Muscle Activity Analyzer

พินทั้งหมดที่ใช้บน **ESP32 DevKit (3.3V Logic)** สำหรับเฟิร์มแวร์ในโฟลเดอร์ [`test-sensor/src/`](test-sensor/src/) โดยเฉพาะไฟล์ `esp32_connectToWifi.cpp`, `esp32_workout_firmware.cpp` และไฟล์ที่แตกออกมาจากมัน (รวมถึง `uno_emg_fsr_link.cpp` บน Arduino Uno ที่เชื่อมกับ `esp32_workout_firmware.cpp` ผ่าน UART)

ที่มาของค่าพิน: [`test-sensor/include/board_config.h`](test-sensor/include/board_config.h)

## เซนเซอร์ (ของเดิม)

| สัญญาณ | GPIO | โหมด | หมายเหตุ |
| :--- | :--- | :--- | :--- |
| I2C SDA | **GPIO 21** | I2C | ใช้ร่วมกันทั้ง MPU-6050/6500, MAX30102, MLX90614 (ต้องมี Pull-up 4.7kΩ ไปที่ 3.3V) |
| I2C SCL | **GPIO 22** | I2C | ใช้ร่วมกันกับทั้ง 3 เซนเซอร์ I2C ด้านบน |
| sEMG (Analog) | **GPIO 34** | ADC1 CH6, `analogRead` | อ่านค่าไฟฟ้ากล้ามเนื้อ, ADC1 ใช้ร่วมกับ WiFi ได้ปกติ — ใช้เฉพาะ `esp32_connectToWifi.cpp` (รุ่นเก่า); `esp32_workout_firmware.cpp` รับค่านี้จาก Arduino Uno ผ่าน UART แทน ดูหัวข้อ "UART Link" ด้านล่าง |
| FSR (Analog) | **GPIO 35** | ADC1 CH7, `analogRead` | อ่านค่าแรงกด, ADC1 ใช้ร่วมกับ WiFi ได้ปกติ — ใช้เฉพาะ `esp32_connectToWifi.cpp` (รุ่นเก่า); `esp32_workout_firmware.cpp` รับค่านี้จาก Arduino Uno ผ่าน UART แทน ดูหัวข้อ "UART Link" ด้านล่าง |

> ⚠️ ห้ามใช้ ADC2 (GPIO 0, 2, 4, 12–15, 25–27) สำหรับ `analogRead` ขาใหม่ๆ ถ้าโปรแกรมเปิด WiFi ไว้ (ตัว ESP32 มีข้อจำกัดว่า ADC2 ใช้ร่วมกับ WiFi ไม่ได้) — แต่ใช้เป็น digital input/output (เช่นปุ่มกด) ได้ตามปกติ

## UART Link ระหว่าง ESP32 กับ Arduino Uno (sEMG + FSR — ของใหม่ `esp32_workout_firmware.cpp`)

`esp32_workout_firmware.cpp` ไม่อ่าน sEMG/FSR จากขา ADC ของตัวเองอีกแล้ว แต่รับค่าจาก Arduino Uno ที่รัน `uno_emg_fsr_link.cpp` ผ่านสาย UART แทน

### ขาเซนเซอร์บน Arduino Uno (ของใหม่)

| สัญญาณ | Arduino Uno | โหมด | หมายเหตุ |
| :--- | :--- | :--- | :--- |
| sEMG (Analog) | **Pin A0** | `analogRead`, 10-bit (0-1023) | อ่านค่าไฟฟ้ากล้ามเนื้อ, ต่อเข้า Uno แทนที่จะเป็น ESP32 |
| FSR (Analog) | **Pin A1** | `analogRead`, 10-bit (0-1023) | อ่านค่าแรงกด, กลับด้านค่า (`ADC_MAX_VAL - analogRead(...)`) แล้วสเกลเป็น 12-bit ก่อนส่งให้ ESP32 ดูหัวข้อ Protocol ด้านล่าง |

ที่มาของค่าพิน: Uno ใช้ `board_config.h` ตัวเดียวกับ ESP32/ESP8266 แต่ auto-detect เป็นสาขา `ARDUINO_ARCH_AVR` ซึ่ง fix พินไว้ที่ A0/A1 เหมือนกันกับที่ระบุไว้ในตารางเปรียบเทียบพินของ [`test-sensor/README.md`](test-sensor/README.md)

### พินเชื่อมต่อ UART (ESP32 ↔ Uno)

| สัญญาณ | ESP32 | Arduino Uno | หมายเหตุ |
| :--- | :--- | :--- | :--- |
| Uno TX → ESP32 RX | **GPIO 16** (RX2) | Pin **3** (SoftwareSerial TX) | ⚠️ **ต้องมี Voltage Divider** ก่อนเข้า GPIO16 เพราะ Uno ส่งสัญญาณ 5V แต่ ESP32 รับได้สูงสุด 3.3V — ใช้ตัวต้านทาน 2 ตัว R1=1kΩ (จาก Uno TX) ต่อ R2=2.2kΩ (ลง GND) แล้วดึงจุดกลางเข้า GPIO16 (ได้ ~3.44V, ค่ามาตรฐาน E12 ทั้งคู่ หาซื้อง่าย) |
| ESP32 TX → Uno RX | **GPIO 17** (TX2) | Pin **2** (SoftwareSerial RX) | ต่อตรงได้ (3.3V มักพอเกิน threshold ของ Uno ที่ 5V) ถ้าอ่านค่าไม่นิ่ง ให้เพิ่ม pull-up 10kΩ ไปที่ 5V ที่ขานี้ หรือใช้ Level Shifter เหมือน I2C |
| GND ร่วม | **GND** | **GND** | จำเป็นเสมอ ไม่มี GND ร่วม = สัญญาณอ่านผิดพลาด/สื่อสารไม่ได้ |

- **Baud rate:** 9600 (ฝั่ง Uno ใช้ `SoftwareSerial` บนขา 2/3 — เว้นขา 0/1 (hardware Serial) ไว้ให้ USB debug ล้วนๆ ไม่ชนกับลิงก์นี้; ฝั่ง ESP32 ใช้ `Serial2` ซึ่งเป็น hardware UART ตัวที่ 3 ของชิป ไม่ชนกับ `Serial` ที่ใช้ debug ผ่าน USB)
- **Protocol:** Uno ส่งข้อความ 1 บรรทัดทุก ~10ms (100Hz) รูปแบบ `<emg>,<fsr>\n` โดยค่าที่ส่งถูกสเกลจาก ADC 10-bit ของ Uno (0-1023) ขึ้นมาเป็น 12-bit (0-4095) ให้ตรงกับสเกลที่ ESP32/เว็บเซิร์ฟเวอร์คาดไว้ (`ADC_MAX = 4095` ใน `telemetryStore.ts`) และ FSR ถูกกลับด้าน (`ADC_MAX_VAL - analogRead(...)`) ให้ค่ามาก = กำแรงตั้งแต่ฝั่ง Uno แล้ว ฝั่ง ESP32 ไม่ต้องแปลงซ้ำ
- **ถ้าลิงก์ขาด** (ไม่ได้ต่อ Uno / สายหลุด): ESP32 จะพิมพ์ `[UART] Uno EMG/FSR link LOST` ผ่าน Serial Monitor (ตรวจจากไม่มีข้อมูลเข้ามาเกิน 500ms) และคงค่า sEMG/FSR ล่าสุดที่เคยได้รับไว้ (ไม่รีเซ็ตเป็น 0)

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

## บัซเซอร์แจ้งเตือนแรงกำต่ำ/ไม่นิ่ง (ของใหม่ — `esp32_workout_firmware.cpp`)

| สัญญาณ | GPIO | โหมด | หมายเหตุ |
| :--- | :--- | :--- | :--- |
| Buzzer | **GPIO 25** | Digital Output | ต่อขา + ของบัซเซอร์ (active buzzer) เข้า GPIO 25 อีกขาเข้า GND |

ค่า FSR ที่อ่านได้ (`fsrLatest`) ถูกกลับด้าน (`ADC_MAX_VAL - analogRead(FSR_PIN)`) ให้ค่ามาก = กำแรง, ค่าน้อย = กำเบา/ไม่ได้กำ (ตัวเซนเซอร์จริงอ่านค่าสูงตอนพักและลดลงเมื่อมีแรงกด)

พฤติกรรม: ระหว่างที่เซตกำลังทำงานอยู่ (`setActive == true`) ถ้าค่า FSR ต่ำกว่า 300 (ADC count, จาก 0-4095, มี hysteresis 50 กันเสียงกระตุกที่รอยต่อ threshold) **หรือ** ค่าความนิ่ง (`computeFsrStability()`) ต่ำกว่า 70% (กำสั่น/ไม่สม่ำเสมอ) ต่อเนื่องอย่างน้อย 3 วินาที บัซเซอร์จะส่งเสียงติด/ดับสลับกันทุก 150ms เพื่อเตือน ไม่ส่งเสียงตอนพัก (`setActive == false`) เพราะตอนไม่ได้กำ ค่า FSR จะต่ำอยู่แล้วตามปกติ ไม่ใช่เหตุการณ์ "กำอ่อนลง"

## จอแสดงผล (LCD)

| อุปกรณ์ | บัส | Address | หมายเหตุ |
| :--- | :--- | :--- | :--- |
| LCD 16x2 (I2C, PCF8574 backpack) | I2C (ใช้บัสเดียวกับ MPU/MAX30102/MLX90614: SDA=**GPIO 21**, SCL=**GPIO 22**) | `0x27` (ค่าเริ่มต้น) | ถ้าจอไม่ติด ให้รันสเก็ตช์ `01_i2c_scanner` หาแอดเดรสจริง (มักเป็น `0x27` หรือ `0x3F`) แล้วแก้ `LCD_I2C_ADDR` ในไฟล์ |

Library: `marcoschwartz/LiquidCrystal_I2C` (ประกาศไว้เฉพาะ env `esp32_wifi_buttons` ใน `platformio.ini`)

เนื้อหาที่แสดงบนจอ (อัปเดตทุก 200ms):
- **บรรทัด 1:** `REP:<จำนวนครั้ง>` — ค่าหลักที่ต้องมีตามที่ขอ
- **บรรทัด 2:** `V:<ความเร็วขึ้น m/s> HR:<ชีพจร bpm>` — ความเร็วช่วงยก (VBT, จาก MPU) และอัตราการเต้นหัวใจ (จาก MAX30102) เพราะเป็น 2 ค่าที่บอกได้ทันทีว่า "เร็บนี้เป็นยังไง" และ "พร้อมเซ็ตต่อไปหรือยัง" โดยไม่ต้องเปิดหน้าเว็บดู

## ไฟล์ที่เกี่ยวข้อง

- [`test-sensor/src/esp32_workout_firmware.cpp`](test-sensor/src/esp32_workout_firmware.cpp) — เฟิร์มแวร์หลัก (WiFi + 6 เซนเซอร์ + ปุ่ม 2 ปุ่ม + จอ LCD แสดง REP/Velocity/HR + บัซเซอร์แจ้งเตือนแรงกำต่ำ/ไม่นิ่ง; ปุ่มยังไม่ผูก logic เพิ่ม/ลด REP รอกำหนดพฤติกรรมเพิ่มเติม; sEMG/FSR รับผ่าน UART จาก Arduino Uno แทน `analogRead` ของตัวเอง ดูหัวข้อ "UART Link" ด้านบน)
- [`test-sensor/src/uno_emg_fsr_link.cpp`](test-sensor/src/uno_emg_fsr_link.cpp) — เฟิร์มแวร์ Arduino Uno (ของใหม่) อ่าน sEMG (A0) + FSR (A1) ที่ 100Hz แล้วส่งให้ ESP32 ผ่าน UART (`uno_emg_fsr_link` env ใน `platformio.ini`)
- [`test-sensor/src/esp32_connectToWifi.cpp`](test-sensor/src/esp32_connectToWifi.cpp) — เฟิร์มแวร์รุ่นก่อนหน้า ไม่มีปุ่ม/จอ LCD/บัซเซอร์ (WiFi + 6 เซนเซอร์, อ่าน sEMG/FSR จากขาตัวเองโดยตรง)
