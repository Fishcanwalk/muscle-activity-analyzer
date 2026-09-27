# บทที่ 3 การพัฒนา

## 3.1 ภาษา เครื่องมือ และสภาพแวดล้อมที่ใช้พัฒนา

| ส่วน | ภาษา/เครื่องมือที่ปรากฏในแหล่งข้อมูล | หน้าที่ |
|---|---|---|
| Arduino Uno และ ESP32 | C/C++ บน Arduino framework | อ่านเซนเซอร์ ประมวลผล และส่ง telemetry |
| Backend | Python, FastAPI, Pydantic, Motor | API, authentication และการเข้าถึง MongoDB |
| Frontend | TypeScript, SvelteKit | แดชบอร์ด API proxy SSE และ state การฝึก |
| ฐานข้อมูล | MongoDB | เก็บ telemetry ผลเซสชัน calibration และข้อมูลผู้ใช้ |
| การพัฒนาในเครื่อง | Docker, Poetry, npm | เตรียม MongoDB ติดตั้ง dependency และรันบริการ |

README ระบุสภาพแวดล้อมหลักเป็น Python 3.11 ขึ้นไป, Poetry, Node.js 20 ขึ้นไป, npm และ Docker Compose สำหรับ MongoDB

### รายการอุปกรณ์และวัสดุ

รายการด้านล่างเป็นอุปกรณ์และวัสดุที่ต้องใช้สำหรับประกอบและทดสอบระบบตามการกำหนดพินใน `PINS.md` และการเรียกใช้งานจริงใน firmware สองไฟล์

| รายการ | จำนวนโดยประมาณ | หน้าที่หรือจุดสังเกต |
|---|---:|---|
| บอร์ด ESP32 DevKit (ลอจิก 3.3V) | 1 | อ่านเซนเซอร์ I2C, รับ UART, ประมวลผล และส่งข้อมูลผ่าน Wi-Fi |
| Arduino Uno หรือ Nano (ลอจิก 5V) | 1 | อ่าน sEMG และ FSR ด้วย ADC แล้วส่งข้อมูลให้ ESP32 ที่ 9600 baud |
| เซนเซอร์ sEMG | 1 ชุด | ต่อเข้าขา A0 ของ Arduino Uno |
| เซนเซอร์ FSR | 1 ชุด | ต่อเข้าขา A1 ของ Arduino Uno เพื่ออ่านแรงกด/แรงกำ |
| MPU6050 หรือ MPU6500 ที่ใช้ I2C | 1 | วัดการเคลื่อนไหว มุม และใช้คำนวณความเร็วการยก |
| MAX30102 | 1 | อ่านชีพจรและใช้คำนวณค่า SpO₂ โดยค่าที่ได้เป็นค่าประมาณ |
| MLX90614 | 1 | วัดอุณหภูมิแบบไม่สัมผัส/อุณหภูมิผิว |
| LCD 16x2 พร้อม I2C backpack PCF8574 | 1 | แสดงจำนวนครั้ง ความเร็ว และชีพจรบนอุปกรณ์ โดยค่าเริ่มต้นใช้ address `0x27` |
| Active buzzer | 1 | แจ้งเตือนเมื่อแรงกำต่ำหรือแรงกำไม่นิ่งระหว่างเซต |
| ปุ่มกด | 2 | ปุ่ม A ต่อ GPIO32 และปุ่ม B ต่อ GPIO33 แบบ `INPUT_PULLUP` กดแล้วเป็น LOW |
| ตัวต้านทาน 4.7 kΩ | 2 | Pull-up ของสาย I2C SDA/SCL ไปที่ 3.3V หากโมดูลไม่มีตัวต้านทานติดมา |
| ตัวต้านทาน 1 kΩ และ 2.2 kΩ | อย่างละ 1 | Voltage divider ลดระดับสัญญาณจาก Uno TX 5V ก่อนเข้า ESP32 RX GPIO16 |
| ตัวต้านทาน 10 kΩ หรือ level shifter | 1 ชุด (ทางเลือก) | ใช้ช่วยดึงสัญญาณฝั่ง ESP32 TX หรือปรับระดับสัญญาณ หาก UART ไม่เสถียร |
| สาย jumper, breadboard และจุดต่อสาย | ตามการประกอบ | เชื่อมต่อบอร์ด เซนเซอร์ ปุ่ม และวงจรแบ่งแรงดัน โดยต้องต่อ GND ร่วมกัน |
| สาย USB และคอมพิวเตอร์สำหรับอัปโหลด/ดู Serial Monitor | 1 ชุด | ใช้อัปโหลด firmware และตรวจสอบ log; ต้องถอดสาย UART ที่ชนกับ pin 0/1 ของ Uno ก่อนอัปโหลด |

ข้อควรระวังคือ Uno ใช้ระดับสัญญาณ 5V แต่ GPIO ของ ESP32 รับได้ 3.3V จึงต้องผ่าน voltage divider ในทิศทาง Uno TX ไป ESP32 RX และต้องต่อกราวด์ร่วมกัน ส่วนเซนเซอร์ I2C ทั้งหมดใช้บัส SDA GPIO21 และ SCL GPIO22 ของ ESP32

## 3.2 โครงสร้างซอฟต์แวร์และหน้าที่ของส่วนประกอบหลัก

### เฟิร์มแวร์

- `uno_emg_fsr_link/uno_emg_fsr_link.ino` — อ่าน EMG/FSR ด้วย ADC และส่ง UART
- `uno_emg_fsr_link/board_config.h` — กำหนดขาและช่วง ADC ของบอร์ด
- `esp32_workout_firmware/esp32_workout_firmware.ino` — รวมข้อมูลเซนเซอร์ จัดการ task, ปุ่ม, จอ, buzzer, Wi-Fi และ HTTP
- `esp32_workout_firmware/board_config.h` — กำหนด mapping I2C/ADC แบบหลายสถาปัตยกรรม

### เว็บและ API

- `frontend/src/routes/api/telemetry` — รับ telemetry และเปิด SSE
- `frontend/src/lib/server/telemetryStore.ts` — เก็บสถานะสด แปลงค่า และส่งต่อ backend
- `frontend/src/lib/workout/` — state ของ workout, telemetry, camera, recording และ calibration
- `backend/app/routers/` — endpoint authentication, telemetry, sessions, calibration และ users
- `backend/app/models/` — schema ข้อมูลที่รับและส่ง
- `backend/app/db.py` — client MongoDB และการสร้างดัชนี

## 3.3 การพัฒนาฟังก์ชันหลักและการเชื่อมต่อระหว่างส่วนประกอบ

การเชื่อมต่อเริ่มจาก UART ระหว่าง Uno กับ ESP32 โดย Uno ส่งข้อความหนึ่งบรรทัดต่อรอบอ่าน และ ESP32 อ่านจนพบ newline แล้ว parse เป็นจำนวนเต็มสองค่า จากนั้น ESP32 รวมกับข้อมูล I2C และสร้าง JSON telemetry

Frontend route `/api/telemetry` รับ JSON และเรียก `ingestFullTelemetry()` เพื่ออัปเดตสถานะสด เมื่อมีข้อมูลใหม่จะ broadcast event `telemetry` ให้ browser และเรียก `forwardToBackend()` เพื่อส่งต่อไป FastAPI

การปรับเทียบใช้ frontend route `/api/calibration` เป็น proxy ที่ตรวจสอบผู้ใช้ เรียก backend และอัปเดต cache ใน telemetry store ให้การแปลงหน่วยของข้อมูลสดใช้ค่าเดียวกับค่าที่บันทึกไว้ ส่วนผลเซตใช้ route ของ FastAPI ผ่าน client ที่สร้างใน frontend

แหล่งข้อมูล: `README.md`, `backend/pyproject.toml`, `frontend/package.json`, โครงสร้างไฟล์ใน `backend/`, `frontend/` และสองโฟลเดอร์เฟิร์มแวร์, `frontend/src/routes/api/telemetry/+server.ts`, `frontend/src/routes/api/calibration/+server.ts`, `frontend/src/lib/server/telemetryStore.ts`, `backend/app/routers/telemetry.py`, `backend/app/routers/calibration.py`, โค้ด Arduino ทั้งสองโฟลเดอร์
