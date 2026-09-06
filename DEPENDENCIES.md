# 📦 คู่มือการติดตั้ง Dependencies & สภาพแวดล้อมการพัฒนา (Environment Setup)

เอกสารนี้รวบรวมสิ่งที่ต้องติดตั้งทั้งหมดสำหรับการพัฒนาโปรเจกต์ **Muscle Activity Analyzer** บน **Ubuntu Linux** ครอบคลุมตั้งแต่ระดับระบบปฏิบัติการ (OS), IDE Extensions, ไปจนถึง Dependencies ของแต่ละส่วน (IoT, Backend, Frontend)

---

## 1. 🐧 ระดับระบบปฏิบัติการ (Ubuntu / Linux System Requirements)

### 1.1 แพ็กเกจพื้นฐานที่จำเป็น
เปิด Terminal แล้วรันคำสั่ง:
```bash
sudo apt update
sudo apt install -y python3 python3-pip pipx curl git build-essential
```

### 1.2 การตั้งค่าสิทธิ์พอร์ต USB Serial สำหรับบอร์ดไมโครคอนโทรลเลอร์ ⚠️ *(สำคัญมาก)*
บน Ubuntu ค่าเริ่มต้นจะบล็อกไม่ให้ User ทั่วไปเข้าถึงพอร์ต `/dev/ttyUSB*` หรือ `/dev/ttyACM*` ต้องตั้งค่าดังนี้:

#### 1) เพิ่มผู้ใช้เข้ากลุ่ม `dialout`
```bash
sudo usermod -a -G dialout $USER
```
*(ต้อง **Log out แล้ว Log in ใหม่** หรือ Restart เครื่อง 1 ครั้งเพื่อให้สิทธิ์มีผล)*

#### 2) ติดตั้ง udev rules ของ PlatformIO
ช่วยให้ระบบ Ubuntu ตรวจจับบอร์ด ESP32 / Arduino อัตโนมัติ:
```bash
curl -fsSL https://raw.githubusercontent.com/platformio/platformio-core/develop/platformio/assets/system/99-platformio-udev.rules | sudo tee /etc/udev/rules.d/99-platformio-udev.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```

#### 3) ลบเซอร์วิส `brltty` (สำหรับ Ubuntu 22.04 ขึ้นไป)
ป้องกันไม่ให้เซอร์วิส Braille display แย่งพอร์ตชิปแปลงสัญญาณ USB-to-UART (เช่น CH340 / CP2102):
```bash
sudo apt remove -y brltty
```

---

## 2. 🧩 IDE Extensions (VS Code / Antigravity / Cursor)

ติดตั้ง Extensions ผ่านแท็บ Extension (`Ctrl + Shift + X`):

| Extension | Extension ID | หน้าที่ | จำเป็นสำหรับ |
| :--- | :--- | :--- | :--- |
| **PlatformIO IDE** | `platformio.platformio-ide` | เครื่องมือคอมไพล์, Flash, และ Serial Monitor สำหรับ C++ | **test-sensor/**, **iot/** |
| **C/C++** | `ms-vscode.cpptools` | ระบบ Auto-complete (IntelliSense) และจัดรูปแบบโค้ด C++ | **test-sensor/**, **iot/** |
| **Python** | `ms-python.python` | รองรับการเขียนและรัน Python Flask | **backend/** |
| **Svelte for VS Code** | `svelte.svelte-vscode` | Syntax Highlighting และ Diagnostic สำหรับ Svelte | **frontend/** |
| **Tailwind CSS IntelliSense** | `bradlc.vscode-tailwindcss` | ตัวช่วยเขียน Tailwind CSS ใน Svelte | **frontend/** |

---

## 3. 🔌 PlatformIO CLI (สำหรับรันคำสั่งผ่าน Terminal)

หากต้องการรันคำสั่ง เช่น `pio run -d test-sensor ...` ผ่าน Terminal โดยตรง ให้ติดตั้ง PlatformIO Core CLI:

```bash
# ติดตั้งผ่าน pipx (แนะนำสำหรับ Ubuntu ยุคใหม่)
pipx install platformio
pipx ensurepath
```
*(ปิดแล้วเปิด Terminal ใหม่อีกครั้งเพื่อเริ่มใช้งานคำสั่ง `pio`)*

---

## 4. 📚 Dependencies แต่ละส่วนของโปรเจกต์

### 4.1 ชุดทดสอบและ IoT (C++ / PlatformIO)
โฟลเดอร์: `test-sensor/` และ `iot/`  
*(PlatformIO จะดาวน์โหลด Libraries เหล่านี้ให้ **โดยอัตโนมัติ** เมื่อกดคอมไพล์ครั้งแรก)*

| Library | เวอร์ชัน | หน้าที่ |
| :--- | :--- | :--- |
| `Wire` | Built-in | สื่อสาร I2C Bus |
| `adafruit/Adafruit MPU6050` | `^2.2.6` | ไดรเวอร์เซนเซอร์วัดความเร่งและมุมหมุน 6 แกน |
| `adafruit/Adafruit Unified Sensor` | `^1.1.14` | ไดรเวอร์พื้นฐานสำหรับเซนเซอร์ของ Adafruit |
| `sparkfun/SparkFun MAX3010x` | `^1.1.2` | ไดรเวอร์เซนเซอร์วัดชีพจร (BPM) และ SpO2 |
| `adafruit/Adafruit MLX90614 Library`| `^2.1.5` | ไดรเวอร์เซนเซอร์วัดอุณหภูมิผิวหนังแบบอินฟราเรด |
| `bblanchon/ArduinoJson` | `^7.0.0` | สร้างและแปลง JSON Payload บน ESP32 *(ใช้ใน `iot/`)* |

---

### 4.2 เซิร์ฟเวอร์ API (Python Flask + MongoDB)
โฟลเดอร์: `backend/`

#### ความต้องการพื้นฐาน
- **Python:** `>= 3.10`
- **Docker & Docker Compose:** สำหรับรัน MongoDB ในเครื่องได้ทันที

#### Python Packages (`backend/requirements.txt`)
```text
Flask>=3.0.0
flask-cors>=4.0.0
pymongo>=4.6.0
pydantic>=2.6.0
python-dotenv>=1.0.0
gunicorn>=21.2.0
```

ติดตั้งด้วยคำสั่ง:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

### 4.3 เว็บแสดงผล (Svelte Frontend SPA)
โฟลเดอร์: `frontend/`

#### ความต้องการพื้นฐาน
- **Node.js:** `>= 18.x`
- **npm:** `>= 9.x`

ติดตั้ง Node.js บน Ubuntu (หากยังไม่มี):
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

#### npm Packages ที่ใช้งาน
- `svelte` / `@sveltejs/vite-plugin-svelte`
- `vite`
- `chart.js` (สำหรับกราฟ Real-time)
- `lucide-svelte` (ไอคอนประกอบ UI)

ติดตั้งด้วยคำสั่ง:
```bash
cd frontend
npm install
```

---

## 5. 🚀 สรุปคำสั่งเริ่มใช้งานด่วน (Quickstart Checklist)

```bash
# 1. ตั้งค่าสิทธิ์ USB (ทำครั้งเดียว)
sudo usermod -a -G dialout $USER
sudo apt remove -y brltty

# 2. ติดตั้ง PlatformIO CLI
pipx install platformio
pipx ensurepath

# 3. เสียบบอร์ด ESP32 / Arduino แล้วทดสอบสแกนพอร์ตทันที
pio run -d test-sensor -e esp32_i2c_scanner -t upload -t monitor
```
