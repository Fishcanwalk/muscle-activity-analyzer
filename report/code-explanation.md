# คำอธิบายโค้ด Firmware ทั้งหมด

เอกสารนี้อธิบายเฉพาะโค้ดจาก 2 ไฟล์ต่อไปนี้เท่านั้น

1. `test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino`
2. `test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino`

เอกสารนี้อธิบายหน้าที่ของตัวแปร ฟังก์ชัน ลำดับการทำงาน และการสื่อสารระหว่างบอร์ด โดยยึดจากโค้ดในสองไฟล์ข้างต้นเท่านั้น

---

## 1. ภาพรวมการทำงานร่วมกัน

โค้ดแบ่งหน้าที่เป็น 2 บอร์ด

```text
sEMG + FSR
   │ ADC
   ▼
Arduino Uno
   │ UART 9600 baud: "emg,fsr\n"
   ▼
ESP32
   ├── อ่าน MPU6050/MPU6500, MAX30102, MLX90614 ผ่าน I2C
   ├── รับปุ่ม A/B และควบคุม buzzer/LCD
   ├── รวมข้อมูลใน FreeRTOS tasks
   ├── ส่ง EMG ผ่าน WebSocket /ws/emg ทุก 20 ms
   └── ส่ง JSON ของ sensor อื่นและปุ่มผ่าน HTTP POST ทุก 100 ms
```

Uno ทำหน้าที่อ่าน EMG และ FSR ให้ได้จังหวะสม่ำเสมอที่ 100 Hz ส่วน ESP32 ทำหน้าที่รวมข้อมูลจาก Uno กับ sensor ของตัวเอง แล้วประมวลผลและส่งข้อมูลออกไป

จุดสำคัญคือ Uno ไม่ได้ใช้ `analogRead()` แบบรอค้างในลูป แต่ใช้ Timer1 และ ADC interrupt ส่วน ESP32 ไม่ได้ทำงานหลักใน `loop()` แต่สร้าง FreeRTOS tasks แล้วลบ Arduino loop task ทิ้ง

---

## 2. Arduino Uno: `uno_emg_fsr_link.ino`

### 2.1 ไลบรารีและค่าคงที่

ไฟล์นี้ include ความสามารถที่จำเป็นสำหรับ ATmega328P ได้แก่ Arduino API, AVR interrupt, sleep และ watchdog

ค่าหลักในไฟล์มีดังนี้

| รายการ | ค่า/หน้าที่ |
|---|---|
| `ESP32_LINK_BAUD` | 9600 baud สำหรับส่งข้อมูลไป ESP32 |
| `ADC_CHANNEL_EMG` | ช่อง ADC 0 หรือ A0 |
| `ADC_CHANNEL_FSR` | ช่อง ADC 1 หรือ A1 |
| `SAMPLE_RATE_HZ` | 100 Hz หรือหนึ่งรอบทุก 10 ms |
| `TIMER1_OCR1A_VALUE` | ค่าเปรียบเทียบของ Timer1 ที่คำนวณจาก clock, prescaler และ sample rate |
| `FLAG_TIMER_TICK` | flag แจ้งว่าถึงรอบอ่านใหม่ |
| `FLAG_EMG_READY` | flag แจ้งว่าอ่าน EMG เสร็จ |
| `FLAG_FSR_READY` | flag แจ้งว่าอ่าน FSR เสร็จ |

ตัวแปร `eventFlags` เป็น `volatile` เพราะถูกแก้ทั้งใน interrupt และใน `loop()` ส่วน `emgRawIsr`, `fsrRawIsr` และ `currentAdcChannel` ใช้เก็บสถานะที่เกี่ยวข้องกับ ADC interrupt

### 2.2 `setupSampleTimer()` และ Timer1

ฟังก์ชันนี้ตั้งค่า Timer1 โดยทำตามลำดับดังนี้

1. ปิด interrupt ชั่วคราวด้วย `cli()` เพื่อไม่ให้การตั้งค่า register ถูกขัดจังหวะ
2. ล้างค่า `TCCR1A`, `TCCR1B` และ `TCNT1`
3. ใส่ค่าเปรียบเทียบลง `OCR1A`
4. เปิดโหมด CTC ด้วย `WGM12`
5. ตั้ง prescaler เป็น 64 ด้วย `CS11` และ `CS10`
6. เปิด Timer1 Compare Match A interrupt ด้วย `OCIE1A`
7. เปิด interrupt กลับด้วย `sei()`

เมื่อ Timer1 นับถึงค่า `OCR1A` จะเรียก ISR ต่อไปนี้

```cpp
ISR(TIMER1_COMPA_vect) {
  eventFlags |= FLAG_TIMER_TICK;
}
```

ISR ไม่ได้อ่าน ADC และไม่ส่งข้อมูลเอง แต่ทำหน้าที่สั้น ๆ คือ set flag เพื่อให้ `loop()` เริ่มรอบอ่านใหม่

### 2.3 `setupAdc()`

ฟังก์ชันนี้ตั้งค่า ADC register โดยมีหน้าที่หลักดังนี้

- `REFS0` เลือก AVcc เป็นแรงดันอ้างอิง
- `ADEN` เปิดใช้งาน ADC
- `ADIE` เปิด ADC conversion complete interrupt
- `ADPS2`, `ADPS1`, `ADPS0` ตั้ง prescaler เป็น 128
- `DIDR0` ปิด digital input buffer ของ A0 และ A1 เพื่อลด noise และลดการใช้พลังงาน

เริ่มต้นเลือกช่อง EMG ก่อน แต่ยังไม่เริ่ม conversion จนกว่าจะมีการเรียก `startAdcConversion()`

### 2.4 `startAdcConversion(uint8_t channel)`

ฟังก์ชันนี้รับหมายเลข ADC channel แล้วทำ 2 อย่าง

1. เก็บ channel ปัจจุบันไว้ใน `currentAdcChannel`
2. เปลี่ยน MUX ของ ADC แล้ว set bit `ADSC` เพื่อเริ่ม conversion

การเก็บ channel ปัจจุบันจำเป็นเพราะเมื่อ ADC เสร็จ interrupt จะต้องรู้ว่าค่าที่ได้เป็น EMG หรือ FSR

### 2.5 `ISR(ADC_vect)`

นี่คือ interrupt ที่ทำงานเมื่อ ADC conversion เสร็จ

1. อ่านค่าจาก register `ADC`
2. ถ้า channel ปัจจุบันคือ EMG
   - เก็บค่าลง `emgRawIsr`
   - ตั้ง `FLAG_EMG_READY`
   - เริ่มอ่าน FSR ต่อทันที
3. ถ้า channel ปัจจุบันคือ FSR
   - เก็บค่าลง `fsrRawIsr`
   - ตั้ง `FLAG_FSR_READY`

ดังนั้นหนึ่งรอบการวัดมีลำดับเป็น EMG → FSR โดยไม่ต้องกลับเข้า `loop()` ระหว่าง conversion ทั้งสองตัว

### 2.6 `setup()` ของ Uno

`setup()` เตรียมระบบก่อนเริ่มอ่านข้อมูล

1. ล้าง `MCUSR` เพื่อเคลียร์ reset cause
2. เรียก `wdt_disable()` ป้องกัน watchdog reset loop หลังบูต
3. เริ่ม `Serial` ที่ 9600 baud
4. เรียก `setupBoardAdc()` ซึ่งเป็น hook ของการตั้งค่า ADC ตามบอร์ด
5. ตั้ง Timer1 ด้วย `setupSampleTimer()`
6. ตั้ง ADC ด้วย `setupAdc()`
7. เลือก `SLEEP_MODE_IDLE` เพื่อให้ Timer1 และ ADC ยังปลุก CPU ได้
8. เปิด watchdog ที่ timeout 2 วินาทีด้วย `wdt_enable(WDTO_2S)`

### 2.7 `loop()` ของ Uno

ลูปหลักทำงานตามลำดับนี้

1. เรียก `sleep_mode()` เพื่อรอ Timer1 หรือ ADC interrupt
2. ถ้ายังไม่มี `FLAG_TIMER_TICK` ให้กลับไปนอนต่อ
3. ล้าง `FLAG_TIMER_TICK`
4. เริ่ม ADC ที่ช่อง EMG
5. นอนรอจนมี `FLAG_FSR_READY`
6. ล้าง `FLAG_EMG_READY` และ `FLAG_FSR_READY`
7. ปิด interrupt ชั่วคราว แล้วคัดลอกค่าจากตัวแปรที่ ISR เขียน
8. เปิด interrupt กลับ
9. กลับด้านค่า FSR
10. แปลงค่าจาก ADC 10-bit ช่วง 0-1023 เป็นช่วง 0-4095
11. ส่งข้อมูลเป็น `emgScaled,fsrScaled` ตามด้วย newline
12. เรียก `wdt_reset()` หลังจบรอบสมบูรณ์

การกลับด้าน FSR ทำเพราะในโค้ดกำหนดให้ค่าที่มากขึ้นหมายถึงแรงกำมากขึ้น ขณะที่ค่าดิบของเซนเซอร์อ่านสูงตอนพักและลดลงเมื่อมีแรงกด

### 2.8 เหตุผลของการใช้ interrupt และ sleep บน Uno

ถ้าใช้ `analogRead()` โดยตรง CPU จะรอ conversion แบบ busy-wait ทุกครั้ง การใช้ ADC interrupt ทำให้ CPU สามารถหลับระหว่างรอ conversion และตื่นเมื่อมีผลลัพธ์แล้ว นอกจากนี้ Timer1 ยังทำให้จังหวะ sampling คงที่กว่าโค้ดที่ตรวจ `millis()` ในลูป

---

## 3. ESP32: `esp32_workout_firmware.ino`

### 3.1 ไลบรารีและส่วนประกอบที่ include

ไฟล์นี้ประกอบด้วยกลุ่มไลบรารีดังนี้

- `WiFi.h` และ `HTTPClient.h` สำหรับเชื่อม Wi-Fi และส่ง HTTP
- `WebSocketsClient.h` (library WebSockets by Markus Sattler) สำหรับส่ง EMG ผ่าน WebSocket
- `Wire.h` สำหรับ I2C
- `Adafruit_MLX90614.h` สำหรับอุณหภูมิ
- `MAX30105.h` และ `heartRate.h` สำหรับ MAX30102 และตรวจ beat
- `LiquidCrystal_I2C.h` สำหรับ LCD 16x2
- FreeRTOS headers สำหรับ task, queue และ semaphore
- ESP-IDF headers สำหรับ watchdog, sleep, timer, GPIO และเวลาไมโครวินาที

ไฟล์ยัง include ส่วนกำหนดค่าของบอร์ดเพื่อใช้ macro เช่นขา I2C แต่คำอธิบายในเอกสารนี้อธิบายเฉพาะการเรียกใช้ macro ที่ปรากฏใน `.ino` เท่านั้น

### 3.2 ค่าคงที่และอุปกรณ์

#### ปุ่มและ buzzer

- Button A ใช้ GPIO32
- Button B ใช้ GPIO33
- ปุ่มเป็น active-low เพราะใช้ pull-up และถือว่ากดเมื่ออ่านได้ LOW
- debounce ตั้งไว้ 250 ms และรอให้ขานิ่งอีก 30 ms (`BUTTON_SETTLE_MS`) ก่อนยืนยันการกด
- buzzer ใช้ GPIO25
- แรงกำคิดเป็นเปอร์เซ็นต์จากค่า calibrate `fsrZero`..`fsrMax` ที่ได้จาก server ต้องมีช่วงห่างอย่างน้อย 100 ADC counts จึงถือว่า calibrate แล้ว
- แรงกำเกิน 20% ถือว่าเริ่มกำ ถ้าตกต่ำกว่า 10% หรือต่ำกว่า 60% ของระดับที่เคยกำไว้นาน 200 ms ถือว่ากำหลุด และกลับมาเป็นปกติเมื่อกลับขึ้นถึง 75% ของระดับเดิม
- FSR stability ต่ำกว่า 70% ถือว่าไม่นิ่ง และต้องค้าง 3 วินาทีก่อนเริ่มเตือน
- buzzer สลับสถานะทุก 150 ms ขณะเตือน และเมื่อ server สั่งทดสอบจะดัง 3 ครั้ง

#### LCD และ MPU

LCD เป็นจอ 16x2 ที่ address `0x27` และใช้ I2C bus เดียวกับ sensor อื่น ส่วน MPU ใช้ address `0x68` และอ่าน register โดยตรง เพราะรองรับทั้ง WHO_AM_I `0x68` และ `0x70`

การอ่าน acceleration ตั้งช่วง ±8g และ gyro ±500 dps แล้วนำค่าไปประมาณทิศแรงโน้มถ่วงและคำนวณ velocity ตามแนวตั้งแบบ leaky integration

#### UART และเวลา

ESP32 รับข้อมูล Uno ผ่าน `Serial2` ที่ RX GPIO16, TX GPIO17 และ 9600 baud

#### เซิร์ฟเวอร์

ที่อยู่ของเซิร์ฟเวอร์กำหนดไว้จุดเดียวที่ `SERVER_HOST` และ `SERVER_PORT` ทั้ง URL ของ HTTP POST และ WebSocket สร้างจากสองค่านี้

```cpp
const char* SERVER_HOST = "172.30.81.83";
const uint16_t SERVER_PORT = 5173;
const String serverUrl = String("http://") + SERVER_HOST + ":" + SERVER_PORT + "/api/telemetry";
const char* EMG_WS_PATH = "/ws/emg?role=device";
```

HTTP ตั้ง connect timeout 1500 ms และ read timeout 3000 ms ถ้า POST ล้มเหลวติดกัน 3 ครั้งจะพักส่ง 1 วินาที ส่วน WebSocket (`WebSocketsClient emgSocket`) จะพยายามต่อใหม่ทุก 2000 ms (`EMG_WS_RECONNECT_MS`)

รอบเวลาหลักมีดังนี้

| งาน | รอบ |
|---|---:|
| SensorTask | 10 ms หรือ 100 Hz |
| EmgStreamTask | 20 ms หรือ 50 Hz |
| NetworkTask | 100 ms หรือ 10 Hz |
| LcdTask | 200 ms หรือ 5 Hz |
| อ่าน MLX90614 | 250 ms |
| debug log | 1 วินาที |
| watchdog | 8 วินาที |

### 3.3 ตัวแปรสถานะ sensor

#### MPU

`velocity`, `mpuAx`, `mpuAy`, `mpuAz` เป็นค่าปัจจุบันของ MPU ส่วน `gravX`, `gravY`, `gravZ` และ `gravityRefMss` เก็บทิศและขนาดของแรงโน้มถ่วงที่ประมาณได้ `stillSinceMs` ใช้ reset velocity เมื่ออุปกรณ์นิ่ง และ `lastMpuMicros` ใช้คำนวณเวลาระหว่างตัวอย่างเพื่อ integrate acceleration เป็น velocity

#### Uno link

`unoEmgVal` และ `unoFsrForce` เก็บค่าล่าสุดจาก Uno ส่วน `lastUnoRxMs` ใช้ตัดสินว่าลิงก์ยังทำงานอยู่หรือไม่ ถ้าไม่มีบรรทัดที่ parse ได้เกิน 500 ms จะถือว่าลิงก์หลุด

#### MAX30102

`bpmRates` เป็น buffer ของ BPM ล่าสุด 4 ค่า `bpmRateSpot` เป็นตำแหน่งเขียนถัดไป `lastBeat` ใช้คำนวณช่วงเวลาระหว่าง beat และ `beatAvg` เป็นค่าเฉลี่ย BPM

`FINGER_PRESENT_IR_THRESHOLD` ใช้ตรวจว่ามีนิ้ววางบน sensor หรือไม่ ถ้าค่า IR ต่ำกว่า threshold จะตั้ง BPM เป็น 0

#### SpO2

`irMin`, `irMax`, `redMin`, `redMax` เก็บช่วงของสัญญาณ IR และ Red ในหน้าต่าง 200 ตัวอย่าง จากนั้นคำนวณ AC/DC ratio แล้วประมาณค่า SpO2 เก็บใน `spo2Estimate`

#### MLX90614

`skinTempBaseline` คืออุณหภูมิที่อ่านตอนบูต `skinTemp` คือค่าปัจจุบัน และ `deltaTemp` คือความต่างจาก baseline

#### FSR stability

`fsrHistory` เป็น rolling window 20 ค่า ใช้หาค่าต่ำสุดและสูงสุดของช่วงล่าสุด

### 3.4 `SharedState`, mutex, queue และ task handle

โครงสร้าง `SharedState` เป็นพื้นที่กลางของระบบ แบ่งข้อมูลเป็น 2 กลุ่ม

1. **Sensor snapshot** — FSR, FSR stability, velocity, peak velocity, HR, SpO2 และอุณหภูมิ
2. **Workout/button state** — สถานะ set, เวลาเริ่ม set/rest, จำนวน set, event ปุ่ม, ค่า calibrate FSR (`fsrZeroCal`, `fsrMaxCal`), คำสั่งทดสอบ buzzer และเวลาที่มี activity ล่าสุด

EMG ไม่ได้อยู่ใน `SharedState` แต่ส่งผ่าน `emgQueue` แยกต่างหาก

การอ่านและเขียน `shared` ต้องผ่าน `stateMutex` เพื่อไม่ให้ task อ่านข้อมูลระหว่างที่อีก task กำลังเขียน

ตัว synchronization อื่นมีหน้าที่ดังนี้

| ตัวแปร | หน้าที่ |
|---|---|
| `i2cMutex` | ป้องกัน SensorTask กับ LcdTask ใช้ I2C พร้อมกัน |
| `emgQueue` | ส่ง EMG sample จาก SensorTask ไป EmgStreamTask (64 ช่อง) |
| `buttonEventQueue` | ส่งรหัสปุ่มจาก ISR ไป ControlTask |
| `sampleTickSemaphore` | hardware timer ให้สัญญาณปลุก SensorTask |
| task handles | ใช้เพิ่ม/ลบ task จาก watchdog และอ้างอิง task ต่าง ๆ (`sensorTaskHandle`, `networkTaskHandle`, `lcdTaskHandle`, `controlTaskHandle`, `emgStreamTaskHandle`) |

### 3.5 `connectWiFi()`

ฟังก์ชันนี้ตั้งค่า Wi-Fi ในโหมด station โดย

1. disconnect การเชื่อมต่อเดิม
2. เรียก `WiFi.mode(WIFI_STA)` ปิด Wi-Fi power save ด้วย `WiFi.setSleep(false)` และตั้งกำลังส่งเป็น 19.5 dBm
3. เริ่มเชื่อมต่อด้วย `WiFi.begin()`
4. ตรวจสถานะทุก 500 ms สูงสุด 40 ครั้ง
5. พิมพ์ IP ถ้าเชื่อมต่อสำเร็จ
6. พิมพ์ข้อความผิดพลาดถ้าครบจำนวน retry แล้วไม่สำเร็จ

ฟังก์ชันนี้ถูกเรียกทั้งตอน boot และหลังตื่นจาก light sleep

### 3.6 `setupHttpClient()` และ `applyServerReply()`

`setupHttpClient()` เตรียม `HTTPClient` สำหรับ POST ไป `/api/telemetry`

```cpp
void setupHttpClient() {
  http.end();
  http.begin(httpClient, serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.setReuse(true);
  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_READ_TIMEOUT_MS);
  tcpNoDelaySet = false;
}
```

ฟังก์ชันนี้ถูกเรียกตอน boot และทุกครั้งที่ POST ล้มเหลว การ reset `tcpNoDelaySet` ทำให้ `networkTask()` เปิด TCP_NODELAY ให้ connection ใหม่อีกครั้งหลัง POST สำเร็จครั้งแรก

`applyServerReply()` อ่านคำตอบของ POST แบบค้นหาข้อความ ถ้ามีทั้ง `"fsrZero":` และ `"fsrMax":` จะเก็บลง `shared.fsrZeroCal` และ `shared.fsrMaxCal` ถ้ามี `"beep":true` จะตั้ง `shared.buzzerTestPending` ให้ `controlTask()` ดังเสียงทดสอบ ทั้งหมดทำภายใต้ `stateMutex`

### 3.7 `onSampleTimer()`

นี่คือ ISR ของ hardware timer โดยใช้ `xSemaphoreGiveFromISR()` ปล่อย `sampleTickSemaphore` ให้ SensorTask ทำงาน

ISR ไม่ทำ I2C, HTTP, Serial หรือ delay เพราะงานเหล่านี้ใช้เวลานานและไม่เหมาะกับ interrupt context เมื่อ task ที่มี priority สูงกว่าถูกปลุก จะเรียก `portYIELD_FROM_ISR()`

### 3.8 `buttonA_isr()` และ `buttonB_isr()`

ISR ทั้งสองทำงานเหมือนกัน ต่างกันที่รหัสปุ่ม

1. อ่านเวลาในหน่วยไมโครวินาทีด้วย `esp_timer_get_time()`
2. ถ้ายังไม่พ้น 250 ms จาก event ก่อนหน้า ให้ทิ้ง event
3. บันทึกเวลาล่าสุด
4. ส่ง id `0` หรือ `1` เข้า `buttonEventQueue` ด้วย `xQueueSendFromISR()`

ISR ไม่เปลี่ยน workout state เอง แต่ส่งต่อให้ `controlTask()` ซึ่งเป็น task ปกติ

### 3.9 `pollUnoLink()`

ฟังก์ชันนี้อ่านข้อมูลจาก `Serial2` แบบ non-blocking

1. อ่าน byte ที่มีอยู่ใน buffer จนหมด
2. สะสมตัวอักษรใน `lineBuf`
3. เมื่อพบ `\n` ให้เติม null terminator
4. ใช้ `sscanf(lineBuf, "%d,%d", &emg, &fsr)` แยกค่า EMG และ FSR
5. ถ้า parse สำเร็จให้อัปเดต `unoEmgVal`, `unoFsrForce` และ `lastUnoRxMs`
6. ตัด `\r` ออกจากข้อความเพื่อรองรับบรรทัดแบบ CRLF
7. ถ้าไม่พบ valid line เกิน 500 ms ให้เปลี่ยนสถานะ link เป็น LOST

ฟังก์ชันเก็บค่าล่าสุดไว้ แม้ลิงก์หลุด เพื่อไม่ให้ตัวแปร sensor กลายเป็นข้อมูลที่ไม่สมบูรณ์ทันที

### 3.10 `mpuReadReg()`, `mpuWriteReg()`, `mpuBegin()`, `mpuReadMotion()` และ `updateMpu()`

#### การอ่านและเขียน register

`mpuReadReg()` เขียนหมายเลข register แล้ว request 1 byte กลับมา ส่วน `mpuWriteReg()` เขียนหมายเลข register และ value ใน transaction เดียว

#### `mpuBegin()`

1. อ่าน WHO_AM_I
2. ยอมรับเฉพาะ `0x68` หรือ `0x70`
3. ปลุก MPU ด้วย `PWR_MGMT_1`
4. ตั้ง gyro เป็น ±500 dps
5. ตั้ง accelerometer เป็น ±8g

ถ้า WHO_AM_I ไม่ตรงจะคืนค่า `false`

#### `mpuReadMotion()`

ฟังก์ชันนี้อ่าน 14 byte ต่อเนื่องจาก register `ACCEL_XOUT_H` (accel 3 แกน, อุณหภูมิ, gyro 3 แกน) แล้วประกอบเป็น signed 16-bit จากนั้นแปลง acceleration เป็น m/s² ด้วยตัวหาร 4096 ซึ่งสอดคล้องกับช่วง ±8g และแปลง gyro เป็น dps ด้วยตัวหาร 65.5 ซึ่งสอดคล้องกับช่วง ±500 dps

#### `updateMpu()`

1. เรียก `mpuReadMotion()` และหา `dt` จาก `micros()` ถ้า `dt` ผิดปกติจะใช้ 10 ms แทน
2. ครั้งแรกใช้ acceleration ปัจจุบันเป็นทิศแรงโน้มถ่วงเริ่มต้น
3. หมุนเวกเตอร์แรงโน้มถ่วงตาม gyro แล้วผสมกับ acceleration ด้วย complementary filter (`GRAVITY_FILTER_ALPHA` 0.98)
4. เรียนรู้ขนาดแรงโน้มถ่วง `gravityRefMss` ช้า ๆ เมื่อหมุนน้อยกว่า 8 dps
5. ฉาย acceleration ลงแนวแรงโน้มถ่วง ลบ `gravityRefMss` แล้ว integrate เป็น velocity พร้อม decay 0.998
6. ถ้าอุปกรณ์นิ่งต่อเนื่อง 150 ms จะ reset velocity เป็น 0

### 3.11 `updateFsrStability()` และ `computeFsrStability()`

`updateFsrStability()` เขียนค่า FSR ลง rolling buffer 20 ตำแหน่งแล้วเลื่อน index แบบวนรอบ

`computeFsrStability()` หาค่า `lo` และ `hi` ของ buffer แล้วคำนวณ

```text
stability = 100 - ((hi - lo) / 200) * 100
```

จากนั้นบังคับผลลัพธ์ให้อยู่ระหว่าง 0 ถึง 100 หากข้อมูลยังมีน้อยกว่า 2 ค่า จะคืนค่า 100 เพื่อไม่แจ้งเตือนเร็วเกินไป

### 3.12 `updateSpo2Window()`

ฟังก์ชันนี้เก็บค่า Red และ IR จนครบหน้าต่าง 200 ตัวอย่าง แล้วคำนวณ

1. AC จาก `max - min`
2. DC จาก `(max + min) / 2`
3. ratio จากสัดส่วน Red AC/DC ต่อ IR AC/DC
4. SpO2 จาก `110 - 25 * ratio`
5. จำกัดผลลัพธ์ไว้ระหว่าง 70 ถึง 100

หลังคำนวณแล้ว reset จำนวนตัวอย่างเพื่อเริ่มหน้าต่างใหม่

### 3.13 `updateBuzzer()`

ฟังก์ชันนี้เป็น state machine ขนาดเล็กสำหรับแจ้งเตือนเมื่อกำหลุดหรือกำไม่นิ่ง

1. ถือว่า calibrate แล้วเมื่อ `fsrMax - fsrZero >= 100` และคำนวณ `gripPct` จากช่วงนี้
2. ถ้าไม่มี set ทำงานหรือยังไม่ calibrate ให้ reset ระดับแรงกำและสถานะกำหลุด
3. เมื่อ `gripPct > 20` จะจำระดับแรงกำสูงสุด (`gripLevel`) ที่ค่อย ๆ ลดลงด้วย decay 0.99
4. ถ้าแรงกำต่ำกว่า 10% หรือต่ำกว่า 60% ของ `gripLevel` นาน 200 ms ถือว่ากำหลุด และกลับเป็นปกติเมื่อเกิน 10% และถึง 75% ของ `gripLevel` (hysteresis)
5. ตรวจ `fsrStability < 70` ขณะกำอยู่ ถ้าค้าง 3 วินาทีถือว่ากำไม่นิ่ง
6. ถ้าเงื่อนไขทั้งสองหาย ให้ปิด buzzer ถ้ามีข้อใดข้อหนึ่ง ให้ toggle buzzer ทุก 150 ms

ฟังก์ชันรับค่า sensor เป็น parameter เพื่อให้ `ControlTask` เป็นผู้ส่ง snapshot ที่อ่านผ่าน mutex ไม่ต้องให้ฟังก์ชันนี้แตะ global sensor state โดยตรง

### 3.14 `updateLcd()`

ฟังก์ชันนี้คำนวณเวลาเป็นนาทีและวินาทีจากสถานะ set

- ถ้ายังไม่เคยเริ่ม set จะแสดงข้อความให้กดปุ่มเริ่ม
- ถ้ากำลังทำ set จะแสดงหมายเลข set และ `RUNNING`
- ถ้าอยู่ช่วงพักจะแสดงหมายเลข set และ `RESTING`
- บรรทัดที่สองแสดงเวลาในรูปแบบ `TIME:mm:ss`

ก่อนเขียน LCD จะ lock `i2cMutex` และเติมช่องว่างท้ายบรรทัดเพื่อไม่ให้ข้อความเก่าค้างบนจอ

### 3.15 `initWatchdog()`

ฟังก์ชันนี้ใช้ `esp_task_wdt_config_t` ของ ESP32 Arduino Core 3 ตั้ง timeout เป็น millisecond (8 วินาที) และตั้ง `trigger_panic` ให้บอร์ดรีสตาร์ทเมื่อหมดเวลา โค้ดรองรับเฉพาะ Core 3 ขึ้นไป ถ้าคอมไพล์ด้วย Core ที่เก่ากว่าจะหยุดด้วย `#error`

ถ้า watchdog ถูก initialize ไว้แล้วใน Core 3 จะเรียก `esp_task_wdt_reconfigure()` แทนการล้มเหลวทันที

task ที่ subscribe watchdog มี 5 ตัว ได้แก่ SensorTask, NetworkTask, LcdTask, ControlTask และ EmgStreamTask

### 3.16 `enterLightSleepUntilWake()`

ฟังก์ชันนี้ถูกเรียกเมื่อระบบ idle จริงเกิน 5 นาที โดยต้องไม่มี set ทำงานและไม่มี set ถูกเริ่มมาก่อนตามเงื่อนไขใน `controlTask()`

ลำดับการทำงานคือ

1. แสดงสถานะ sleeping บน LCD
2. ตัด Wi-Fi และ reset `tcpNoDelaySet`
3. เอา task ทั้ง 5 ตัว (รวม `emgStreamTaskHandle`) ออกจาก watchdog
4. deinit watchdog เพื่อไม่ให้ timeout ระหว่าง sleep
5. ตั้ง Button A เป็น wake source แบบ ext0 เมื่อกด LOW
6. ตั้ง timer wake ทุก 5 วินาทีเพื่อไม่ให้นอนค้างถาวร
7. เรียก `esp_light_sleep_start()`
8. อ่านสาเหตุการตื่น
9. สร้าง watchdog และ subscribe task ทั้ง 5 ตัวกลับ
10. เชื่อม Wi-Fi ใหม่ (WebSocket ของ EMG จะต่อใหม่เองใน `emgStreamTask()` เมื่อ Wi-Fi กลับมา)

Button B ไม่ได้ถูกตั้งเป็น wake source ในฟังก์ชันนี้ แต่ยังใช้งานได้ตามปกติเมื่อ ESP32 ตื่นอยู่

### 3.17 `sensorTask()`

`sensorTask()` เป็นงานหลักของการอ่านข้อมูล ทำงานบน core 1 และ priority 3

ในแต่ละรอบจะทำดังนี้

1. รอ `sampleTickSemaphore` จาก hardware timer
2. reset watchdog
3. เรียก `pollUnoLink()` เพื่อ drain UART
4. อ่านค่า EMG และ FSR ล่าสุดจาก Uno
5. อัปเดต FSR history และคำนวณ stability
6. ส่ง EMG เข้า `emgQueue` แบบไม่ block
7. ถ้า queue เต็ม ให้ทิ้ง sample เก่าก่อนส่ง sample ใหม่
8. lock I2C แล้วอ่าน MPU, MAX30102 และ MLX90614 ตามสถานะอุปกรณ์
9. คำนวณ velocity จาก MPU ด้วย `updateMpu()`
10. ตรวจ beat และคำนวณ BPM จาก MAX30102
11. อัปเดต SpO2 window จาก Red/IR
12. อ่านอุณหภูมิ MLX เมื่อครบ interval
13. เขียน snapshot ลง `shared` ภายใต้ `stateMutex`
14. พิมพ์ consolidated debug log ทุก 1 วินาที

การใช้ queue แบบไม่ block มีเป้าหมายไม่ให้การส่ง EMG ที่ค้างทำให้รอบอ่าน 100 Hz หยุด ผู้ดึงข้อมูลจาก `emgQueue` คือ `emgStreamTask()`

### 3.18 `networkTask()`

`networkTask()` ทำงานบน core 0 และ priority 2 ทุก 100 ms และส่งเฉพาะข้อมูลที่เปลี่ยนช้า (FSR, MPU, vitals และปุ่ม) ไม่ได้ส่ง EMG

1. รอด้วย `vTaskDelayUntil()` เพื่อรักษาคาบเวลา
2. reset watchdog
3. ถ้า Wi-Fi ไม่ connected ให้ข้ามรอบ
4. ถ้า POST ล้มเหลวติดกันครบ 3 ครั้งและยังไม่พ้นช่วง backoff 1 วินาที ให้ข้ามรอบ
5. lock `stateMutex` แล้ว copy `SharedState` เป็น snapshot และ reset `peakVelocity` เป็นค่า velocity ปัจจุบัน
6. อ่าน flag ปุ่ม A/B แล้ว clear เป็น one-shot event
7. สร้าง JSON ที่มี `board`, `fsr`, `mpu`, `vitals` และ `buttons`
8. เรียก `http.POST(payload)`
9. ถ้าได้ HTTP response (code > 0) ให้ reset ตัวนับความล้มเหลว เปิด TCP_NODELAY ด้วย `httpClient.setNoDelay(true)` ถ้ายังไม่เคยเปิดใน connection นี้ ส่งคำตอบให้ `applyServerReply()` แล้วพิมพ์ HTTP code และเวลาที่ POST ใช้
10. ถ้า code <= 0 ให้พิมพ์ข้อความจาก `http.errorToString()` พร้อมข้อมูล Wi-Fi เรียก `setupHttpClient()` ใหม่ เริ่ม backoff เมื่อครบ 3 ครั้ง และคืน flag ปุ่มที่ส่งไม่สำเร็จกลับเข้า `shared`

payload ที่สร้างมีรูปแบบดังนี้

```cpp
snprintf(payload, sizeof(payload),
         "{\"board\":\"esp32\","
         "\"fsr\":{\"force\":%d,\"stability\":%.1f},"
         "\"mpu\":{\"velocity\":%.3f,\"peakVelocity\":%.3f},"
         "\"vitals\":{\"hr\":%d,\"spo2\":%.1f,\"skinTemp\":%.2f,\"deltaTemp\":%.2f},"
         "\"buttons\":{\"a\":%s,\"b\":%s}}",
         // ...
```

HTTP client ถูกสร้างและตั้ง reuse ใน `setupHttpClient()` เพื่อไม่ต้องสร้าง TCP connection ใหม่ทุก packet

### 3.19 `emgStreamTask()`

`emgStreamTask()` ทำงานบน core 0 และ priority 3 (stack 6144) ทุก 20 ms (`EMG_STREAM_INTERVAL_MS`) ทำหน้าที่ส่ง EMG ไปเซิร์ฟเวอร์ผ่าน WebSocket แยกจาก HTTP POST

ตอนเริ่ม task จะตั้งค่า `emgSocket` ครั้งเดียว

```cpp
emgSocket.begin(SERVER_HOST, SERVER_PORT, EMG_WS_PATH);
emgSocket.onEvent(onEmgSocketEvent);
emgSocket.setReconnectInterval(EMG_WS_RECONNECT_MS);
```

`onEmgSocketEvent()` พิมพ์ `[EMG-WS] connected` หรือ `[EMG-WS] disconnected` เมื่อสถานะเปลี่ยน

ในแต่ละรอบจะทำดังนี้

1. รอด้วย `vTaskDelayUntil()` และ reset watchdog
2. ถ้า Wi-Fi connected ให้เรียก `emgSocket.loop()` เพื่อให้ library จัดการการเชื่อมต่อและ reconnect
3. drain sample ทั้งหมดใน `emgQueue` มาต่อเป็นข้อความคั่นด้วยจุลภาค เช่น `2612,2618` (ปกติ 2 ค่า เพราะ sample ทุก 10 ms แต่ส่งทุก 20 ms)
4. ถ้ามี sample และ `emgSocket.isConnected()` ให้ส่งด้วย `emgSocket.sendTXT(frame, pos)`

ถ้า WebSocket ยังไม่เชื่อมต่อ sample ที่ drain ออกมาในรอบนั้นจะถูกทิ้งและไม่ถูกส่งย้อนหลัง

ฝั่งเซิร์ฟเวอร์ EMG จากบอร์ดถูกรับโดย `frontend/emg-ws.js` แล้วส่งต่อให้เบราว์เซอร์ผ่าน WebSocket `/ws/emg` ส่วน SSE ส่งเฉพาะ sensor อื่นและปุ่ม

### 3.20 `lcdTask()`

`lcdTask()` ทำงานบน core 1 และ priority 1 ซึ่งต่ำสุดในกลุ่ม task นี้ เพราะการพลาดการอัปเดตจอไม่สำคัญเท่าการพลาด sampling

ทุก 200 ms task จะอ่าน `setActive`, `setStartMs`, `restStartMs` และ `setCount` ผ่าน `stateMutex` แล้วเรียก `updateLcd()`

### 3.21 `controlTask()`

`controlTask()` เป็นเจ้าของการเปลี่ยนสถานะปุ่มและ workout state

1. reset watchdog
2. ถ้าขาปุ่มกลับเป็น HIGH (ปล่อยปุ่ม) ให้ arm ปุ่มนั้นใหม่
3. รอ event จาก `buttonEventQueue` สูงสุด 100 ms
4. เมื่อได้ event ให้รอ 30 ms แล้วอ่านขาซ้ำ ถือเป็นการกดจริงเฉพาะเมื่อปุ่มถูก arm อยู่และขายังเป็น LOW จากนั้น disarm จนกว่าจะปล่อยปุ่ม
5. ถ้าได้ Button A ให้ toggle `setActive`
   - จากพักเป็นทำงาน: บันทึกเวลาเริ่มและเพิ่ม `setCount`
   - จากทำงานเป็นพัก: บันทึก `restStartMs`
   - set `buttonAEventPending`
6. ถ้าได้ Button B ให้หยุด set, บันทึก `restStartMs`, reset set count และ set `buttonBEventPending`
7. อัปเดต `lastActivityMs`
8. อ่าน FSR, stability, set state, ค่า calibrate และคำสั่งทดสอบ buzzer จาก `shared`
9. ถ้ามีคำสั่งทดสอบจาก server ให้ดัง buzzer 3 ครั้ง
10. เรียก `updateBuzzer()`
11. ถ้า idle ครบ 5 นาที เรียก `enterLightSleepUntilWake()`
12. หลังตื่น reset idle clock เพื่อไม่ให้ timer wake ทำให้กลับเข้า sleep ทันที

### 3.22 `setup()` ของ ESP32

`setup()` เป็นจุดเริ่มต้นที่เตรียม hardware, communication และ RTOS

#### ขั้นที่ 1: Serial และ GPIO

- เปิด Serial ที่ 115200
- delay 100 ms ให้ UART settle
- ตั้ง buzzer เป็น output และดัง 2 ครั้งเพื่อบอกว่าบอร์ดเริ่มทำงาน
- เริ่ม `Serial2` สำหรับ Uno

#### ขั้นที่ 2: I2C และ LCD

- เริ่ม I2C ด้วย macro ของขา SDA/SCL
- ตั้ง clock เป็น 100 kHz
- initialize LCD, backlight และข้อความ Booting

#### ขั้นที่ 3: เริ่ม sensor

- ทดลองเริ่ม MPU สูงสุด 5 ครั้ง
- ทดลองเริ่ม MAX30102 สูงสุด 5 ครั้ง และตั้งค่า LED
- ตั้ง I2C กลับเป็น 100 kHz หลัง library ของ MAX30102 เปลี่ยน clock
- ทดลองเริ่ม MLX90614 สูงสุด 5 ครั้ง
- เก็บค่าอุณหภูมิแรกเป็น baseline
- เตรียมค่าเริ่มต้นของ FSR history

ถ้า sensor ตัวใดเริ่มไม่ได้ จะเก็บ status เป็น false และ task จะข้ามการอ่าน sensor ตัวนั้นแทนที่จะหยุดทั้งระบบ

#### ขั้นที่ 4: Wi-Fi และ HTTP

- พิมพ์ free heap ก่อนเชื่อมต่อ
- เรียก `connectWiFi()`
- เรียก `setupHttpClient()` ซึ่งเรียก `http.begin(httpClient, serverUrl)`, ตั้ง `Content-Type: application/json`, เปิด connection reuse และตั้ง timeout
- WebSocket ของ EMG ยังไม่ถูกเปิดที่นี่ แต่เปิดใน `emgStreamTask()`

#### ขั้นที่ 5: RTOS primitives

สร้าง mutex, semaphore และ queue ดังนี้

- `stateMutex`
- `i2cMutex`
- `sampleTickSemaphore`
- `emgQueue` ความยาว 64
- `buttonEventQueue` ความยาว 8

จากนั้นตั้ง `shared.lastActivityMs` และ initialize watchdog

#### ขั้นที่ 6: GPIO interrupt

ใช้ `gpio_config_t` ตั้ง GPIO32 และ GPIO33 พร้อมกันด้วย bitmask, เปิด pull-up และเลือก `GPIO_INTR_NEGEDGE` จากนั้นติดตั้ง ISR service และผูก handler ให้แต่ละปุ่ม

#### ขั้นที่ 7: Hardware timer

โค้ดใช้ timer API ของ Arduino Core 3 เท่านั้น

- `timerBegin(1000000)` ให้ timer tick 1 MHz แล้วตั้ง alarm ที่ 10,000 microseconds
- ผูก timer เข้ากับ `onSampleTimer()` ตั้งเป็น auto-reload แล้วเรียก `timerStart()`

#### ขั้นที่ 8: สร้าง task และ subscribe watchdog

สร้าง task 5 ตัวด้วย `xTaskCreatePinnedToCore()` แล้วเพิ่ม task handle ทั้งหมดเข้า watchdog

```cpp
xTaskCreatePinnedToCore(sensorTask, "SensorTask", 4096, nullptr, 3, &sensorTaskHandle, 1);
xTaskCreatePinnedToCore(networkTask, "NetworkTask", 8192, nullptr, 2, &networkTaskHandle, 0);
xTaskCreatePinnedToCore(lcdTask, "LcdTask", 2560, nullptr, 1, &lcdTaskHandle, 1);
xTaskCreatePinnedToCore(controlTask, "ControlTask", 2560, nullptr, 2, &controlTaskHandle, 1);
xTaskCreatePinnedToCore(emgStreamTask, "EmgStreamTask", 6144, nullptr, 3, &emgStreamTaskHandle, 0);
```

### 3.23 `loop()` ของ ESP32

หลัง `setup()` สร้าง task ครบแล้ว `loop()` ไม่ต้องทำงานอีก จึงเรียก

```cpp
vTaskDelete(NULL);
```

คำสั่งนี้ลบ Arduino loop task ทำให้ระบบขับเคลื่อนด้วย FreeRTOS tasks ทั้งหมด

---

## 4. ลำดับข้อมูลตั้งแต่ Uno ถึง WebSocket/HTTP

```text
Timer1 Compare Match ของ Uno
        │
        ▼
เริ่ม ADC A0 → ADC ISR → เริ่ม ADC A1 → ADC ISR
        │
        ▼
กลับด้าน/scale ค่า → Serial.print("emg,fsr")
        │ UART
        ▼
ESP32 pollUnoLink()
        │
        ▼
SensorTask อัปเดต queue และ SharedState
        │
        ├── MPU / MAX30102 / MLX90614 ผ่าน I2C
        │
        ├── emgQueue ──► EmgStreamTask ทุก 20 ms
        │                  │
        │                  ▼
        │               emgSocket.sendTXT("2612,2618")  → WebSocket /ws/emg
        │
        └── SharedState ──► NetworkTask รวม JSON ทุก 100 ms
                              │
                              ▼
                           HTTPClient.POST(payload)  → /api/telemetry
```

การแบ่งรอบแบบนี้ทำให้ sampling ของ Uno และ SensorTask เป็นงานที่มีจังหวะชัดเจน ขณะที่ WebSocket และ HTTP ทำงานเป็น task แยกกันและไม่บล็อกการอ่าน sensor โดยตรง EMG จึงไม่ต้องรอ POST ของ sensor อื่น

---

## 5. สรุปหน้าที่ของฟังก์ชัน

### Arduino Uno

| ฟังก์ชัน | หน้าที่ |
|---|---|
| `setupSampleTimer()` | ตั้ง Timer1 CTC และเปิด compare interrupt |
| `setupAdc()` | ตั้งค่า ADC, reference, prescaler และ ADC interrupt |
| `startAdcConversion()` | เลือก ADC channel และเริ่ม conversion |
| `setup()` | เตรียม Serial, Timer, ADC, sleep และ watchdog |
| `loop()` | รอ interrupt, อ่านค่าที่เสร็จ, scale และส่ง UART |
| `TIMER1_COMPA_vect` | ตั้ง flag รอบ sampling |
| `ADC_vect` | เก็บค่า EMG/FSR และต่อ conversion เป็น chain |

### ESP32

| ฟังก์ชัน | หน้าที่ |
|---|---|
| `connectWiFi()` | เชื่อม Wi-Fi และ retry |
| `setupHttpClient()` | เตรียม HTTP client, header, reuse, timeout และ reset `tcpNoDelaySet` |
| `applyServerReply()` | อ่าน `fsrZero`/`fsrMax`/`beep` จากคำตอบของ POST |
| `onSampleTimer()` | ปลุก SensorTask ด้วย semaphore |
| `buttonA_isr()` / `buttonB_isr()` | debounce และส่ง event ปุ่มเข้า queue |
| `pollUnoLink()` | parse ข้อมูล UART จาก Uno |
| `mpuReadReg()` / `mpuWriteReg()` | อ่าน/เขียน register ของ MPU |
| `mpuBegin()` | ตรวจ WHO_AM_I และตั้งค่า MPU |
| `mpuReadMotion()` | อ่าน acceleration และ gyro 3 แกนและแปลงหน่วย |
| `updateMpu()` | ประมาณทิศแรงโน้มถ่วงและคำนวณ velocity |
| `updateFsrStability()` | เพิ่มค่าเข้า rolling window |
| `computeFsrStability()` | คำนวณเปอร์เซ็นต์ความนิ่ง |
| `updateSpo2Window()` | คำนวณ SpO2 จากช่วง Red/IR |
| `updateBuzzer()` | ตรวจแรงกำ/ความนิ่งและควบคุมเสียงเตือน |
| `updateLcd()` | แสดงสถานะ set และเวลา |
| `initWatchdog()` | ตั้ง watchdog 8 วินาทีด้วย API ของ Core 3 |
| `enterLightSleepUntilWake()` | ปิดงานที่ไม่ควรทำระหว่าง sleep และตั้ง wake source |
| `sensorTask()` | อ่านและประมวลผล sensor ทุก 10 ms |
| `networkTask()` | รวมข้อมูล sensor อื่นและปุ่มแล้ว POST ทุก 100 ms |
| `onEmgSocketEvent()` | log สถานะการเชื่อมต่อ WebSocket |
| `emgStreamTask()` | drain `emgQueue` แล้วส่ง EMG ผ่าน WebSocket ทุก 20 ms |
| `lcdTask()` | อัปเดต LCD ทุก 200 ms |
| `controlTask()` | จัดการปุ่ม, set state, buzzer และ light sleep |
| `setup()` | เตรียม hardware, sensor, Wi-Fi, timer, queue และ task |
| `loop()` | ลบตัวเองหลังเริ่ม FreeRTOS tasks |

---

## 6. จุดที่ควรระวังเมื่ออ่านหรือแก้โค้ด

1. Uno ใช้ตัวแปรที่ถูกแก้ใน ISR จึงต้องระวังเรื่อง `volatile` และการคัดลอกข้อมูลแบบ atomic
2. ESP32 ห้ามย้ายงาน I2C, HTTP หรือ `Serial.printf()` ที่ใช้เวลานานเข้า ISR
3. การแก้ `SharedState` ต้องรักษาการใช้ `stateMutex` ให้ครบทั้งฝั่งอ่านและเขียน
4. I2C ถูกใช้ทั้ง SensorTask และ LcdTask จึงต้อง lock `i2cMutex`
5. `emgQueue` ถูกออกแบบให้ไม่ block SensorTask หากแก้เป็นการรอคิว อาจทำให้ sampling หยุด
6. การเปลี่ยนรอบเวลา sampling ต้องพิจารณาทั้ง hardware timer, queue size (64 ช่อง) และรอบส่งของ EmgStreamTask
7. ระหว่างที่ WebSocket หลุด sample EMG ที่ drain ออกจากคิวจะถูกทิ้งและไม่ส่งย้อนหลัง
8. การเปลี่ยน threshold ของ FSR ต้องพิจารณา hysteresis และเวลา delay ก่อนเตือนพร้อมกัน
9. การแก้โครงสร้าง JSON ต้องแก้ทั้งฝั่งสร้าง payload และฝั่งที่รับข้อมูลให้สอดคล้องกัน
10. ค่า SpO2 และ velocity เป็นค่าที่คำนวณโดยประมาณตาม algorithm ในไฟล์ ไม่ใช่ค่าที่ผ่านการสอบเทียบทางห้องปฏิบัติการ
11. ค่า Wi-Fi และ URL ถูกกำหนดเป็นค่าคงที่ใน source code จึงควรระวังการเผยแพร่ไฟล์ที่มีข้อมูลการเชื่อมต่อจริง

---

## 7. สรุปสั้น ๆ

`uno_emg_fsr_link.ino` เป็น firmware สำหรับอ่าน EMG/FSR แบบจับจังหวะด้วย Timer1 และ ADC interrupt แล้วส่งค่าทาง UART ส่วน `esp32_workout_firmware.ino` เป็น firmware หลักที่รับข้อมูลนั้น รวมกับ sensor I2C จัดการปุ่ม LCD buzzer watchdog และ power saving ผ่าน FreeRTOS tasks 5 ตัว ก่อนส่ง EMG ด้วย WebSocket และส่ง telemetry ของ sensor อื่นด้วย HTTP

แกนหลักของการออกแบบคือการแยกงานตามความเร่งด่วน: interrupt ใช้แจ้งเหตุการณ์, task ใช้ทำงานจริง, queue/semaphore ใช้ส่งสัญญาณระหว่างส่วนต่าง ๆ และ mutex ใช้ป้องกัน resource ที่ใช้ร่วมกัน
