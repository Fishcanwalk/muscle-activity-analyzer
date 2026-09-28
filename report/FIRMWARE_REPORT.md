# รายงาน Software สำหรับ ESP32 และ Arduino

**โครงการ:** Muscle Activity Analyzer  
**ขอบเขตของเอกสาร:** source code ในสองโฟลเดอร์ด้านล่างเท่านั้น  
**วันที่จัดทำ:** 25 กันยายน 2569

```text
test-sensor/arduino/uno_emg_fsr_link/
test-sensor/arduino/esp32_workout_firmware/
```

## 1. วัตถุประสงค์

เอกสารนี้อธิบายการทำงานของ software สองส่วนที่ใช้เป็น firmware ของระบบ ได้แก่ ตัวอ่าน sensor บน Arduino Uno และตัวควบคุมหลักบน ESP32 โดยเน้นกลไกที่สำคัญต่อการทำงานจริง ได้แก่ ADC, interrupt, timer/counter, watchdog, I2C, UART, HTTP API และ WebSocket

ในรายงานจะใช้คำว่า **Software** เป็นคำเรียกรวมเพื่อให้อ่านง่าย แต่โค้ดที่รันอยู่บน microcontroller ในทางเทคนิคเรียกว่า **Firmware**

## 2. ภาพรวมการทำงาน

ระบบแบ่งหน้าที่เป็นสองฝั่ง

1. **Arduino Uno — `uno_emg_fsr_link.ino`**
   - อ่าน sEMG จาก A0 และ FSR จาก A1
   - ใช้ Timer1 และ ADC interrupt เพื่ออ่านค่าทุก 10 ms
   - แปลงค่าแล้วส่งไป ESP32 ผ่าน UART ที่ 9600 baud

2. **ESP32 — `esp32_workout_firmware.ino`**
   - รับค่า EMG/FSR จาก Uno ผ่าน `Serial2`
   - อ่าน MPU6050/MPU6500, MAX30102 และ MLX90614 ผ่าน I2C
   - ควบคุมปุ่ม, LCD และ buzzer
   - ส่ง EMG ไป backend ผ่าน WebSocket `/ws/emg` ทุก 20 ms
   - รวมข้อมูล sensor อื่นและปุ่มเป็น JSON แล้วส่งไป backend ผ่าน HTTP POST ทุก 100 ms

ข้อมูลจึงไหลตามลำดับนี้:

```text
Uno ADC (EMG/FSR)
       │ UART
       ▼
ESP32 sensor fusion + control
       │ WebSocket /ws/emg?role=device (EMG)
       │ HTTP POST /api/telemetry (FSR, MPU, vitals, ปุ่ม)
       ▼
Backend
       │ WebSocket /ws/emg (EMG)
       │ SSE /api/telemetry/stream (sensor อื่นและปุ่ม)
       ▼
Browser
```

**จุดสำหรับแทรกภาพ:** ใช้ **Flowchart 1: ภาพรวมการส่งข้อมูลจาก Uno ไป Backend** จาก [flowchart.md](flowchart.md#flowchart-1-ภาพรวมการส่งข้อมูลจาก-uno-ไป-backend) แทรกต่อจากส่วนนี้

## 3. ไฟล์ที่ใช้ในรายงาน

| โฟลเดอร์ | ไฟล์ | หน้าที่ |
|---|---|---|
| `uno_emg_fsr_link/` | `uno_emg_fsr_link.ino` | อ่าน ADC และส่ง EMG/FSR ไป ESP32 |
| `uno_emg_fsr_link/` | `board_config.h` | กำหนด pin และค่าพื้นฐานของบอร์ด |
| `esp32_workout_firmware/` | `esp32_workout_firmware.ino` | อ่าน sensor, ควบคุมอุปกรณ์ และส่งข้อมูลผ่าน WebSocket/HTTP API |
| `esp32_workout_firmware/` | `board_config.h` | กำหนด pin, ADC resolution และรูปแบบการพิมพ์ |

รายงานนี้ไม่รวม sketch ทดสอบ sensor อื่นและไม่อธิบาย firmware นอกสองโฟลเดอร์ข้างต้น

## 4. การต่อสัญญาณที่เกี่ยวข้อง

### 4.1 Arduino Uno

| สัญญาณ | Pin | รายละเอียด |
|---|---:|---|
| sEMG | A0 | อ่านด้วย ADC 10-bit |
| FSR | A1 | อ่านด้วย ADC 10-bit แล้วกลับด้านค่า |
| UART | Pin 0/1 | Hardware Serial ที่ 9600 baud |

### 4.2 ESP32

| สัญญาณ | GPIO | รายละเอียด |
|---|---:|---|
| UART RX จาก Uno | GPIO 16 | `Serial2` รับข้อมูล EMG/FSR |
| UART TX ไป Uno | GPIO 17 | `Serial2` ส่งข้อมูลกลับได้ |
| I2C SDA | GPIO 21 | Bus ร่วมของ MPU, MAX30102, MLX90614 และ LCD |
| I2C SCL | GPIO 22 | Bus ร่วมของอุปกรณ์ I2C |
| ปุ่ม A | GPIO 32 | Start/Stop set, active-low |
| ปุ่ม B | GPIO 33 | Stop/reset session, active-low |
| Buzzer | GPIO 25 | แจ้งเตือนแรงจับ |

**ข้อควรระวัง:** Uno ส่ง logic 5V แต่ ESP32 รับ logic 3.3V ควรลดระดับแรงดันของสาย Uno TX ก่อนเข้าขา GPIO16 และต้องต่อ GND ร่วมกัน

## 5. Arduino Uno: `uno_emg_fsr_link.ino`

### 5.1 การอ่าน ADC

โค้ดไม่ได้ใช้ `analogRead()` ในรอบ sampling หลัก แต่ตั้งค่า ADC register โดยตรงใน `setupAdc()`:

- เปิด ADC ด้วย `ADEN`
- เปิด ADC interrupt ด้วย `ADIE`
- ตั้ง ADC prescaler เป็น `/128`
- ใช้ AVcc เป็น reference ผ่าน `ADMUX`
- ปิด digital input buffer ของ A0/A1 ผ่าน `DIDR0` เพื่อลด noise และการใช้พลังงาน

เมื่อเริ่มรอบใหม่ `startAdcConversion()` จะเลือก channel ผ่าน `ADMUX` แล้วสั่งเริ่ม conversion ด้วย `ADSC`

### 5.2 Timer/Counter

Timer1 ถูกใช้ในโหมด CTC เพื่อสร้างจังหวะ sampling ที่ 100 Hz หรือทุก 10 ms

```cpp
TIMER1_OCR1A_VALUE = (F_CPU / 64 / 100) - 1
```

สำหรับ Uno ที่ clock 16 MHz และ prescaler 64 ค่า compare คือ 2499 เมื่อ counter ถึง `OCR1A` จะเกิด Compare Match A interrupt

การตั้งค่าหลักคือ:

- `WGM12` — CTC mode
- `CS11 | CS10` — prescaler 64
- `OCIE1A` — เปิด Timer1 Compare Match A interrupt

### 5.3 Interrupt flow

มี interrupt สำคัญสองตัว

1. `TIMER1_COMPA_vect`
   - ทำงานทุก 10 ms
   - ไม่อ่าน sensor ใน ISR
   - เพียง set flag `FLAG_TIMER_TICK`

2. `ADC_vect`
   - ทำงานเมื่อ ADC conversion เสร็จ
   - เก็บค่า EMG หรือ FSR ลงตัวแปร `volatile`
   - เมื่ออ่าน EMG เสร็จ จะเริ่ม conversion ของ FSR ต่อทันที
   - set flag `FLAG_EMG_READY` หรือ `FLAG_FSR_READY`

การทำงานหนัก เช่น scaling และการส่ง UART จะทำใน `loop()` ไม่ทำใน ISR เพื่อให้ interrupt สั้นและปลอดภัย

### 5.4 การพัก CPU และ Watchdog

Uno ใช้ `SLEEP_MODE_IDLE` ระหว่างรอ Timer1 หรือ ADC interrupt ทำให้ CPU ไม่ต้องวน loop เปล่า ๆ ตลอดเวลา

ใช้ AVR watchdog ด้วย timeout 2 วินาที:

- ตอนเริ่ม boot จะ `wdt_disable()` ก่อน เพื่อป้องกัน boot loop จาก reset ครั้งก่อน
- หลังตั้งค่าระบบจะ `wdt_enable(WDTO_2S)`
- เมื่อ sampling cycle สำเร็จจะเรียก `wdt_reset()`
- ถ้า sampling ค้างเกิน 2 วินาที บอร์ดจะ reset ตัวเอง

### 5.5 การแปลงค่าและส่ง UART

ค่าจาก Uno เป็น 10-bit (`0-1023`) แต่ฝั่ง ESP32 ใช้ช่วงค่าแบบ 12-bit (`0-4095`) โค้ดจึงทำดังนี้:

1. กลับด้าน FSR ด้วย `ADC_MAX_VAL - fsrRaw` เพราะวงจรนี้ให้ค่า ADC ลดลงเมื่อมีแรงกด
2. ใช้ `map()` ขยาย EMG และ FSR เป็นช่วง `0-4095`
3. ส่งข้อมูลด้วย Hardware Serial รูปแบบ:

```text
emg,fsr\n
```

ค่าความเร็ว UART คือ 9600 baud ตาม `ESP32_LINK_BAUD`

**จุดสำหรับแทรกภาพ:** ใช้ **Flowchart 2: Uno Timer, Interrupt, ADC และ UART** จาก [flowchart.md](flowchart.md#flowchart-2-uno-timer-interrupt-adc-และ-uart) แทรกต่อจากส่วนนี้

## 6. ESP32: `esp32_workout_firmware.ino`

### 6.1 การเริ่มต้นระบบ

ใน `setup()` ESP32 จะเตรียมระบบตามลำดับหลักดังนี้:

1. เปิด `Serial` สำหรับ log ที่ 115200 baud
2. เปิด `Serial2` ที่ 9600 baud โดยใช้ RX GPIO16 และ TX GPIO17
3. เริ่ม I2C ที่ SDA GPIO21 และ SCL GPIO22
4. เริ่ม LCD และตรวจสอบ MPU, MAX30102 และ MLX90614
5. เชื่อมต่อ Wi-Fi
6. เตรียม `HTTPClient` ด้วย `setupHttpClient()`, mutex, queue และ timer
7. ตั้งค่า GPIO interrupt ของปุ่ม A/B
8. สร้าง FreeRTOS tasks 5 ตัว และเพิ่ม task ทั้งหมดเข้า watchdog

### 6.2 UART ระหว่าง Uno กับ ESP32

ESP32 เปิด UART ด้วย:

```cpp
Serial2.begin(UNO_LINK_BAUD, SERIAL_8N1, UNO_LINK_RX_PIN, UNO_LINK_TX_PIN);
```

โดย `UNO_LINK_BAUD` มีค่า 9600

ฟังก์ชัน `pollUnoLink()` จะอ่านข้อมูลจาก `Serial2` แบบไม่ block:

- อ่านทีละ character ขณะที่ `Serial2.available()` ยังมีข้อมูล
- เก็บข้อมูลจนพบ newline
- แยกค่าโดยใช้ `sscanf(lineBuf, "%d,%d", &emg, &fsr)`
- อัปเดต `unoEmgVal`, `unoFsrForce` และเวลา `lastUnoRxMs`
- ถ้าไม่มีข้อมูลที่ถูกต้องเกิน 500 ms จะ log ว่า link หาย

การอ่าน UART อยู่ใน `SensorTask` ทุก 10 ms ทำให้ buffer ถูก drain อย่างต่อเนื่อง

### 6.3 I2C และการอ่าน sensor

ESP32 ใช้ I2C bus เดียวกันกับ sensor และ LCD โดยตั้งความเร็วเริ่มต้นที่ 100 kHz เพื่อให้เหมาะกับสายบน breadboard

อุปกรณ์ที่อ่านผ่าน I2C:

| อุปกรณ์ | Address | การอ่านในโค้ด |
|---|---:|---|
| MPU6050/MPU6500 | `0x68` | อ่าน register โดยตรง (accel + gyro) และคำนวณ velocity |
| MAX30102 | `0x57` | อ่าน FIFO ของ IR/Red แล้วคำนวณ HR/SpO2 โดยประมาณ |
| MLX90614 | `0x5A` | อ่านอุณหภูมิผิวและคำนวณ delta จาก baseline |
| LCD 16x2 | `0x27` | แสดงสถานะ set และเวลา |

เนื่องจาก SensorTask และ LcdTask ใช้ I2C bus ร่วมกัน จึงมี `i2cMutex` คุมการเข้าถึง `Wire` ไม่ให้ transaction ชนกัน

หลังเรียก `max30102.begin()` โค้ดจะตั้ง I2C clock กลับเป็น 100 kHz ก่อนอ่าน MLX90614 เนื่องจาก library MAX30102 อาจเปลี่ยน bus เป็น 400 kHz

### 6.4 การอ่าน ADC ใน firmware หลัก

`esp32_workout_firmware.ino` **ไม่ได้อ่าน EMG และ FSR ด้วย ADC ของ ESP32 โดยตรง** แต่รับค่าที่อ่านและ scale แล้วจาก Arduino Uno ผ่าน UART

ดังนั้นเส้นทาง ADC ของระบบนี้คือ:

```text
EMG/FSR sensor → Uno ADC → scale เป็น 0-4095 → UART → ESP32
```

ESP32 ยังมีค่า pin และ ADC configuration อยู่ใน `board_config.h` เพื่อใช้ร่วมกับโครงสร้างโปรเจกต์ แต่ firmware หลักฉบับนี้ใช้ค่า `unoEmgVal` และ `unoFsrForce` เป็นแหล่งข้อมูลจริง

### 6.5 Hardware timer/counter และ interrupt ของ ESP32

ESP32 ใช้ hardware timer เป็นจังหวะ sampling หลักที่ทุก 10 ms:

- ใช้ `timerBegin(1000000)` ของ ESP32 Arduino Core 3.x ให้ timer tick ที่ 1 MHz หรือความละเอียด 1 microsecond (โค้ดหยุดด้วย `#error` ถ้าคอมไพล์ด้วย Core ที่เก่ากว่า 3.x)
- ตั้ง alarm เป็น `SAMPLE_INTERVAL_MS * 1000`
- timer ISR `onSampleTimer()` ทำเพียง `xSemaphoreGiveFromISR()`
- `SensorTask` รอ `sampleTickSemaphore` แล้วจึงเริ่มรอบอ่านข้อมูล

ปุ่ม A และ B ใช้ GPIO interrupt แบบ falling edge เพราะต่อแบบ active-low:

- ตั้งค่าทั้งสองขาผ่าน `gpio_config_t.pin_bit_mask`
- ใช้ `gpio_isr_handler_add()` แยก handler ของแต่ละปุ่ม
- ISR ตรวจ debounce 250 ms ด้วย `esp_timer_get_time()`
- ISR ส่งรหัสปุ่มเข้า `buttonEventQueue`
- การเปลี่ยนสถานะ set ทำใน `ControlTask` ไม่ทำใน ISR

### 6.6 FreeRTOS tasks และการ sync ข้อมูล

| Task | ความถี่/หน้าที่ |
|---|---|
| `SensorTask` | ทุก 10 ms อ่าน UART, I2C และอัปเดต snapshot (core 1, priority 3) |
| `EmgStreamTask` | ทุก 20 ms drain `emgQueue` แล้วส่ง EMG ผ่าน WebSocket (core 0, priority 3, stack 6144) |
| `NetworkTask` | ทุก 100 ms ส่ง sensor อื่นและปุ่มผ่าน HTTP POST (core 0, priority 2) |
| `LcdTask` | ทุก 200 ms อัปเดต LCD (core 1, priority 1) |
| `ControlTask` | รอ event ปุ่ม จัดการ set, buzzer และ idle sleep (core 1, priority 2) |

กลไกที่ใช้ร่วมกันมีดังนี้:

- `stateMutex` ป้องกันข้อมูลใน `SharedState`
- `i2cMutex` ป้องกันการใช้ I2C พร้อมกัน
- `emgQueue` (64 ช่อง) ส่ง EMG จาก SensorTask ไป EmgStreamTask
- `buttonEventQueue` ส่ง event จาก ISR ไป ControlTask
- `sampleTickSemaphore` ส่งสัญญาณจาก timer ISR ไป SensorTask

**จุดสำหรับแทรกภาพ:** ใช้ **Flowchart 3: ESP32 Task, I2C, UART, Interrupt และ API** จาก [flowchart.md](flowchart.md#flowchart-3-esp32-task-i2c-uart-interrupt-และ-api) แทรกต่อจากส่วนนี้

## 7. Watchdog และ Light Sleep บน ESP32

ESP32 ตั้ง task watchdog timeout 8 วินาที และ subscribe ทั้ง 5 tasks โดยแต่ละ task เรียก `esp_task_wdt_reset()` ในรอบการทำงานของตัวเอง หาก task ใดค้างนานเกินกำหนด ระบบจะ panic และ reboot ตาม configuration ของ watchdog

เมื่อไม่มีการเริ่ม set หรือกดปุ่มนาน 5 นาที `ControlTask` จะเรียก `enterLightSleepUntilWake()` โดย:

1. แสดงสถานะ sleep บน LCD
2. ตัด Wi-Fi
3. ถอด tasks ทั้ง 5 ตัว (รวม `EmgStreamTask`) ออกจาก watchdog และ deinit watchdog
4. ตั้ง wake source เป็น timer และ Button A
5. เข้า `esp_light_sleep_start()`
6. เมื่อตื่น ให้เริ่ม watchdog ใหม่ subscribe tasks ทั้ง 5 ตัวกลับ และเชื่อมต่อ Wi-Fi อีกครั้ง

ส่วนนี้เป็นกลไกประหยัดพลังงาน ไม่ใช่ส่วนของการส่งข้อมูล API โดยตรง

## 8. HTTP API, WebSocket และรูปแบบข้อมูล

ที่อยู่ของเซิร์ฟเวอร์กำหนดไว้จุดเดียวที่ `SERVER_HOST` และ `SERVER_PORT` แล้วนำไปสร้างทั้ง URL ของ HTTP POST และการเชื่อมต่อ WebSocket:

```cpp
const char* SERVER_HOST = "172.30.81.83";
const uint16_t SERVER_PORT = 5173;
const String serverUrl = String("http://") + SERVER_HOST + ":" + SERVER_PORT + "/api/telemetry";
const char* EMG_WS_PATH = "/ws/emg?role=device";
```

### 8.1 EMG ผ่าน WebSocket

EMG ถูกส่งแยกจาก HTTP POST โดย `EmgStreamTask` ผ่าน `WebSocketsClient emgSocket` (library WebSockets by Markus Sattler):

- ตอนเริ่ม task เรียก `emgSocket.begin(SERVER_HOST, SERVER_PORT, EMG_WS_PATH)` และตั้ง reconnect ทุก 2000 ms (`EMG_WS_RECONNECT_MS`)
- ทุก 20 ms (`EMG_STREAM_INTERVAL_MS`) เรียก `emgSocket.loop()` เมื่อ Wi-Fi เชื่อมต่ออยู่
- drain sample ทั้งหมดจาก `emgQueue` มาต่อเป็น text frame ค่า ADC ดิบ 0-4095 คั่นด้วยจุลภาค ปกติมี 2 ค่าต่อ frame
- ส่งด้วย `emgSocket.sendTXT()` เมื่อเชื่อมต่ออยู่ ถ้ายังไม่เชื่อมต่อ sample ที่ drain ออกมาจะถูกทิ้งและไม่ส่งย้อนหลัง

ตัวอย่าง frame:

```text
2612,2618
```

ฝั่งเซิร์ฟเวอร์ EMG จากบอร์ดถูกรับโดย `frontend/emg-ws.js` แล้วส่งต่อให้เบราว์เซอร์ผ่าน WebSocket `/ws/emg` ส่วน SSE ส่งเฉพาะ sensor อื่นและปุ่ม

### 8.2 Sensor อื่นและปุ่มผ่าน HTTP POST

ESP32 เตรียม HTTP client ใน `setupHttpClient()` ดังนี้:

- ใช้ `WiFiClient` และ `HTTPClient`
- เรียก `http.begin(httpClient, serverUrl)` ตอน boot และทุกครั้งที่ POST ล้มเหลว
- ตั้ง header เป็น `Content-Type: application/json`
- เปิด connection reuse ด้วย `http.setReuse(true)`
- ตั้ง connect timeout 1500 ms และ read timeout 3000 ms
- reset `tcpNoDelaySet` เพื่อให้เปิด TCP_NODELAY ใหม่หลัง POST สำเร็จครั้งแรกของ connection

`NetworkTask` ส่งข้อมูลด้วย `http.POST(payload)` ทุก 100 ms เมื่อ Wi-Fi เชื่อมต่ออยู่ ถ้าล้มเหลวติดกัน 3 ครั้งจะพักส่ง 1 วินาที payload ไม่มี EMG แล้ว มีรูปแบบดังนี้:

```json
{
  "board": "esp32",
  "fsr": { "force": 0, "stability": 100.0 },
  "mpu": {
    "velocity": 0.000,
    "peakVelocity": 0.000
  },
  "vitals": {
    "hr": 0,
    "spo2": 98.0,
    "skinTemp": 0.00,
    "deltaTemp": 0.00
  },
  "buttons": { "a": false, "b": false }
}
```

เมื่อ POST ได้ HTTP response (code > 0) จะเปิด TCP_NODELAY ด้วย `httpClient.setNoDelay(true)` หากยังไม่ได้เปิด ส่งคำตอบให้ `applyServerReply()` เพื่ออ่านค่า calibrate `fsrZero`/`fsrMax` และคำสั่งทดสอบ buzzer `beep` แล้ว log HTTP status code และเวลาที่ POST ใช้ หากเชื่อมต่อไม่ได้ (code <= 0) จะแสดงข้อความจาก `http.errorToString(code)` เตรียม HTTP client ใหม่ และคืน event ปุ่มที่ยังส่งไม่สำเร็จกลับไปรอส่งรอบถัดไป

ค่า SpO2 ในโค้ดเป็นค่าประมาณจาก Red/IR ratio ไม่ใช่ค่าทางการแพทย์

## 9. ลำดับการทำงานตั้งแต่เปิดเครื่องจนส่งข้อมูล

1. Uno ตั้งค่า Timer1, ADC, UART, sleep mode และ watchdog
2. ESP32 ตั้งค่า UART, I2C, LCD, ปุ่ม, sensor และ Wi-Fi
3. Timer ของ Uno ปลุก ADC ให้ได้ EMG และ FSR ทุก 10 ms
4. Uno scale ค่าแล้วส่ง `emg,fsr` ผ่าน UART
5. Timer ของ ESP32 ปลุก `SensorTask` ทุก 10 ms เพื่ออ่าน UART และ sensor I2C
6. `SensorTask` อัปเดต `SharedState` และใส่ EMG ลง `emgQueue`
7. `EmgStreamTask` drain `emgQueue` ทุก 20 ms แล้วส่ง EMG ผ่าน WebSocket ไป backend
8. `NetworkTask` รวมข้อมูล sensor อื่นและปุ่มทุก 100 ms แล้วส่ง HTTP POST ไป backend
9. `LcdTask` แสดงสถานะ และ `ControlTask` รับปุ่ม/ควบคุม buzzer

## 10. ข้อควรระวังจาก source code

- ต้องใช้ voltage divider หรือ level shifter ระหว่าง Uno TX กับ ESP32 RX
- ไม่ควรต่อ USB Serial ของ Uno พร้อมกับสาย UART ไป ESP32 หากใช้ pins 0/1 ร่วมกัน
- หาก Uno ไม่ส่งข้อมูลเกิน 500 ms ESP32 จะรายงาน UART link lost และคงค่าล่าสุดไว้
- หาก I2C ถูกใช้งานพร้อมกันโดยไม่มี mutex อาจทำให้ข้อมูลจาก sensor หรือตัว LCD ผิดพลาดได้
- ค่า SpO2 และ velocity เป็นค่าประมาณ ไม่ควรใช้เป็นค่าทางการแพทย์หรือค่าทดสอบมาตรฐาน
- ระหว่างที่ WebSocket หลุด sample EMG ที่ drain ออกจาก `emgQueue` จะถูกทิ้ง ไม่ส่งย้อนหลัง
- Wi-Fi credential และที่อยู่เซิร์ฟเวอร์ (`SERVER_HOST`/`SERVER_PORT`) ถูกกำหนดไว้ใน source code ควรย้ายออกไปก่อนใช้งานจริงหรือเผยแพร่ repository
- ต้องทดสอบ watchdog, light sleep, Wi-Fi reconnect, WebSocket reconnect และ UART บน hardware จริงก่อนใช้งานต่อเนื่อง

## 11. สรุป

`uno_emg_fsr_link.ino` ทำหน้าที่อ่าน ADC แบบ interrupt-driven ที่ 100 Hz และส่งข้อมูลผ่าน UART ส่วน `esp32_workout_firmware.ino` ทำหน้าที่รวมข้อมูลจาก Uno และ sensor I2C แล้วแบ่งงานเป็น FreeRTOS tasks 5 ตัว สำหรับ sampling, EMG streaming ผ่าน WebSocket, network (HTTP POST), LCD และ control

การออกแบบนี้ทำให้การอ่าน sensor ไม่ต้องรอ HTTP POST, EMG ไม่ต้องรอ POST ของ sensor อื่น และมี watchdog/queue/mutex ช่วยควบคุมความเสถียรของระบบ

เอกสารนี้อ้างอิงเฉพาะสองโฟลเดอร์ที่ระบุไว้ด้านบน ไม่มีการแก้ source code firmware และไม่มีการ push ขึ้น remote repository
