# 🧪 Multi-Board Sensor Test & Hardware Diagnostic Suite

โฟลเดอร์นี้รองรับการทดสอบฮาร์ดแวร์เซนเซอร์บน Microcontroller 3 แพลตฟอร์มยอดนิยม:
1. **ESP32 DevKit** (3.3V Logic)
2. **ESP8266 NodeMCU / D1 Mini** (3.3V Logic)
3. **Arduino Uno / Nano** (5.0V Logic - ATmega328P)

ซอร์สโค้ดทั้งหมดมีระบบ **Auto-Detection (`include/board_config.h`)** ซึ่งจะสลับพิน, ระดับแรงดัน (VCC), และความละเอียด ADC (10-bit / 12-bit) ให้อัตโนมัติตามบอร์ดที่เลือกคอมไพล์

> 💡 **สำหรับการติดตั้งสภาพแวดล้อมบน Ubuntu, Extension และการตั้งค่าสิทธิ์พอร์ต USB ดูได้ที่:** [DEPENDENCIES.md](../DEPENDENCIES.md)

---

## 📌 ตารางเปรียบเทียบพินเชื่อมต่อของแต่ละบอร์ด (Pinout Matrix)

| เซนเซอร์ / สัญญาณ | ESP32 DevKit | ESP8266 (NodeMCU/D1) | Arduino Uno / Nano | ข้อควรระวังและคำแนะนำ |
| :--- | :--- | :--- | :--- | :--- |
| **Logic Voltage** | 3.3V | 3.3V | **5.0V** | ⚠️ Uno logic 5V ต้องระวังเซนเซอร์ที่เป็น 3.3V Only |
| **I2C SDA** | **GPIO 21** | **GPIO 4 (D2)** | **A4** | ต่อ Pull-up 4.7kΩ เข้า 3.3V (หรือ 5V บน Uno) |
| **I2C SCL** | **GPIO 22** | **GPIO 5 (D1)** | **A5** | Shared bus ร่วมกันทั้ง 3 ตัว |
| **sEMG (Analog)** | **GPIO 34** (ADC1) | **A0** (TOUT) | **A0** | อ่านค่าไฟฟ้ากล้ามเนื้อ |
| **FSR (Analog)** | **GPIO 35** (ADC1) | **A0** (สลับสายทดสอบ) | **A1** | ESP8266 มี ADC 1 ช่อง ต้องสลับสายระหว่าง sEMG/FSR |
| **ADC Resolution** | 12-bit (0 - 4095) | 10-bit (0 - 1023) | 10-bit (0 - 1023) | ซอฟต์แวร์ Normalize สเกลให้อัตโนมัติ |

> [!WARNING]
> **ข้อควรระวังสำคัญสำหรับ Arduino Uno (5V Logic):**  
> เซนเซอร์ MPU-6050, MAX30102 และ MLX90614 โดยทั่วไปรับไฟเลี้ยง 3.3V (แม้โมดูลส่วนใหญ่จะมี LDO 3.3V บนบอร์ด แต่สาย I2C SDA/SCL ของ Uno ทำงานที่ 5V) หากใช้ Arduino Uno แนะนำให้ต่อไฟเลี้ยงจากขา **3.3V** ของ Uno และควรมี Bi-directional Logic Level Shifter หรือตรวจสอบว่าโมดูลเซนเซอร์ของท่านมีวงจร Level Shifter บนบอร์ดแล้ว

---

## 🚀 คำสั่ง Flash ผ่าน PlatformIO (เลือกบอร์ดและเซนเซอร์ที่ต้องการ)

### 1. ทดสอบบน ESP32 (บอร์ดหลัก)
```bash
# สแกน I2C Bus (MPU6050, MAX30102, MLX90614)
pio run -d test-sensor -e esp32_i2c_scanner -t upload -t monitor

# ทดสอบ sEMG
pio run -d test-sensor -e esp32_semg -t upload -t monitor

# ทดสอบ FSR
pio run -d test-sensor -e esp32_fsr -t upload -t monitor

# ทดสอบ MPU-6050
pio run -d test-sensor -e esp32_mpu6050 -t upload -t monitor

# ทดสอบ MAX30102
pio run -d test-sensor -e esp32_max30102 -t upload -t monitor

# ทดสอบ MLX90614
pio run -d test-sensor -e esp32_mlx90614 -t upload -t monitor

# วินิจฉัยทุกเซนเซอร์พร้อมกัน (All-in-one Diagnostic)
pio run -d test-sensor -e esp32_all -t upload -t monitor
```

---

### 2. ทดสอบบน ESP8266 (NodeMCU / D1 Mini)
```bash
# สแกน I2C Bus (SDA=D2, SCL=D1)
pio run -d test-sensor -e esp8266_i2c_scanner -t upload -t monitor

# ทดสอบ sEMG (พิน A0)
pio run -d test-sensor -e esp8266_semg -t upload -t monitor

# ทดสอบ FSR (พิน A0)
pio run -d test-sensor -e esp8266_fsr -t upload -t monitor

# ทดสอบ MPU-6050
pio run -d test-sensor -e esp8266_mpu6050 -t upload -t monitor

# ทดสอบ MAX30102
pio run -d test-sensor -e esp8266_max30102 -t upload -t monitor

# ทดสอบ MLX90614
pio run -d test-sensor -e esp8266_mlx90614 -t upload -t monitor

# วินิจฉัยรวมทุกเซนเซอร์
pio run -d test-sensor -e esp8266_all -t upload -t monitor
```

---

### 3. ทดสอบบน Arduino Uno / Nano (ATmega328P)
```bash
# สแกน I2C Bus (SDA=A4, SCL=A5)
pio run -d test-sensor -e uno_i2c_scanner -t upload -t monitor

# ทดสอบ sEMG (พิน A0)
pio run -d test-sensor -e uno_semg -t upload -t monitor

# ทดสอบ FSR (พิน A1)
pio run -d test-sensor -e uno_fsr -t upload -t monitor

# ทดสอบ MPU-6050
pio run -d test-sensor -e uno_mpu6050 -t upload -t monitor

# ทดสอบ MAX30102
pio run -d test-sensor -e uno_max30102 -t upload -t monitor

# ทดสอบ MLX90614
pio run -d test-sensor -e uno_mlx90614 -t upload -t monitor

# วินิจฉัยรวมทุกเซนเซอร์
pio run -d test-sensor -e uno_all -t upload -t monitor
```

> **หมายเหตุ:** Serial Monitor ใช้ Baud Rate `115200` สำหรับทุกบอร์ด

---

## 💻 การใช้งานผ่าน Arduino IDE

หากไม่ต้องการใช้ PlatformIO ได้จัดเตรียมโฟลเดอร์สำหรับ Arduino IDE ไว้ให้แล้วที่: [`test-sensor/arduino/`](arduino/)

### โครงสร้างไฟล์ Sketch:
- `arduino/01_i2c_scanner/01_i2c_scanner.ino` (สแกนหา I2C address)
- `arduino/02_semg_adc_test/02_semg_adc_test.ino` (ทดสอบเซนเซอร์กล้ามเนื้อ)
- `arduino/03_fsr_test/03_fsr_test.ino` (ทดสอบเซนเซอร์แรงกด FSR)
- `arduino/04_mpu6050_test/04_mpu6050_test.ino` (ทดสอบ Gyro/Accelerometer)
- `arduino/05_max30102_test/05_max30102_test.ino` (ทดสอบวัดชีพจร)
- `arduino/06_mlx90614_test/06_mlx90614_test.ino` (ทดสอบวัดอุณหภูมิอินฟราเรด)
- `arduino/07_all_diagnostics/07_all_diagnostics.ino` (ทดสอบอ่านค่ารวมทุกตัว)

### ขั้นตอนการตั้งค่าใน Arduino IDE:
1. **เพิ่ม Board URL สำหรับ ESP8266 / ESP32:**
   - ไปที่ `File` -> `Preferences`
   - ในช่อง **Additional boards manager URLs** วางลิงก์:
     ```text
     http://arduino.esp8266.com/stable/package_esp8266com_index.json
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
2. **ติดตั้ง Board Core:**
   - ไปที่ `Tools` -> `Board` -> `Boards Manager...`
   - ค้นหา **esp8266** แล้วกด **Install** (หากใช้ ESP32 ให้ค้นหา **esp32** แล้วกด Install)
3. **ติดตั้ง Libraries ที่จำเป็น:**
   - ไปที่ `Sketch` -> `Include Library` -> `Manage Libraries...`
   - ค้นหาและติดตั้ง 4 ตัวนี้:
     - `Adafruit MPU6050` (กด Install All เพื่อลง Dependencies ร่วม)
     - `SparkFun MAX3010x Pulse and Proximity Sensor Library`
     - `Adafruit MLX90614 Library`
     - `Adafruit Unified Sensor`
4. **เปิด Sketch และ Upload:**
   - ไปที่ `File` -> `Open...` แล้วเลือกไฟล์ `.ino` จากโฟลเดอร์ `test-sensor/arduino/<ชื่อโฟลเดอร์>/`
   - เลือก Board: `NodeMCU 1.0 (ESP-12E Module)` หรือบอร์ดที่คุณใช้งาน
   - เลือก Port: เช่น `/dev/ttyUSB0`
   - กดปุ่ม **Upload** ➡️
