# บทที่ 6 โครงสร้างและการทำงานของโค้ด

## 6.1 แผนผัง codebase และหน้าที่ของเฟิร์มแวร์ เว็บ และ API

```text
test-sensor/arduino/
├── uno_emg_fsr_link/              # Uno: ADC + Timer1 + UART
└── esp32_workout_firmware/        # ESP32: FreeRTOS + I2C + Wi-Fi + HTTP

frontend/src/
├── routes/api/                    # endpoint รับ telemetry, SSE, recording, calibration
├── lib/server/telemetryStore.ts   # สถานะสดและการส่งต่อ backend
└── lib/workout/                   # state ของ workout, telemetry, camera, recording

backend/app/
├── routers/                       # auth, telemetry, sessions, calibration, users
├── models/                        # schema ข้อมูล
├── db.py                          # MongoDB และ index
└── security.py                    # JWT และ password
```

ผังนี้เป็นสรุปหน้าที่ของส่วนประกอบหลัก ไม่ได้รวมไฟล์ที่อยู่นอกขอบเขตแหล่งข้อมูลของรายงาน

telemetry ที่ส่งต่อกันในผังนี้มีโครงสร้างหลักเป็นกลุ่ม `emg`, `fsr`, `mpu`, `vitals`, `device`, `timestamp` และอาจมี `buttons` โดย backend schema อนุญาตฟิลด์เพิ่มเติมเพื่อให้รองรับข้อมูลจากอุปกรณ์ได้ยืดหยุ่น

## 6.2 Arduino Uno: Timer1, ADC Interrupt, Watchdog และ UART

**การจับเวลารอบ sampling:** ใช้ Timer1 ในโหมด CTC โดยตั้ง prescaler 64 และค่า OCR1A ให้เกิด interrupt ที่ความถี่ 100 Hz หรือทุก 10 ms ทุกครั้งที่เกิด `TIMER1_COMPA_vect` ระบบจะตั้ง `FLAG_TIMER_TICK` เพื่อให้ loop เริ่มรอบอ่านข้อมูลใหม่ ทำให้รอบ sampling สม่ำเสมอ

**การอ่านค่า ADC ด้วย interrupt:** ในแต่ละรอบ Uno อ่านค่า 2 ช่อง คือ EMG ที่ขา A0 และ FSR ที่ขา A1 โดยสั่งให้ ADC เริ่มแปลงค่าแล้วไม่ต้องรอ เมื่อแปลงค่าเสร็จ ADC จะเรียก interrupt ให้เก็บค่าไว้ แล้วเริ่มอ่านช่องถัดไปต่อทันที เมื่ออ่านครบทั้ง 2 ช่อง โปรแกรมหลักจะนำค่าไปใช้ ส่วนค่า FSR ต้องกลับด้านก่อน เพราะเซนเซอร์ให้ค่าสูงตอนไม่มีแรงกด

**การประหยัดพลังงาน:** ช่วงที่รอ Timer1 หรือรอ ADC แปลงค่า CPU ไม่มีงานต้องทำ ระบบจึงให้ CPU พักด้วย `SLEEP_MODE_IDLE` และเมื่อเกิด interrupt จาก Timer1 หรือ ADC CPU จะตื่นขึ้นมาทำงานต่อ

**การป้องกันระบบค้าง:** ใช้ Watchdog Timer ของ Uno โดยตั้ง timeout ไว้ 2 วินาที และเรียก `wdt_reset()` ทุกครั้งที่อ่านข้อมูลครบหนึ่งรอบ หากรอบการอ่านค้างนานเกิน 2 วินาที ระบบจะรีสตาร์ทบอร์ดโดยอัตโนมัติ

**การส่งข้อมูลไปยัง ESP32:** แปลงค่า ADC 10-bit (0-1023) เป็นช่วง 0-4095 ด้วย `map()` ให้ตรงกับช่วงค่าที่ ESP32 และ backend ใช้ แล้วส่งผ่าน `Serial` ที่ขา 0/1 ด้วยความเร็ว 9600 baud ในรูปแบบ `emg,fsr` บรรทัดละหนึ่งรอบ

ใช้ [`../flowchart.md`](../flowchart.md) Flowchart 2 เป็นรูปประกอบหัวข้อนี้

## 6.3 ESP32: FreeRTOS, Hardware Timer, GPIO Interrupt, Watchdog, I2C และการส่งข้อมูล

### 6.3.1 ภาพรวมการทำงาน

**การแบ่งงานเป็น Task:** ESP32 แบ่งงานออกเป็น 4 Task ที่ทำงานพร้อมกัน ได้แก่

- `SensorTask`: อ่านข้อมูลเซนเซอร์ถี่ที่สุดเพื่อให้ได้ข้อมูลต่อเนื่อง
- `NetworkTask`: ส่งข้อมูลผ่าน HTTP ไปยังเว็บไซต์ทุก 250 ms
- `LcdTask`: อัปเดตข้อมูลบนจอ LCD ทุก 200 ms
- `ControlTask`: รับเหตุการณ์จากปุ่มกดและจัดการสถานะการฝึก

**การจับเวลารอบ sampling:** ใช้ Timer สร้างสัญญาณที่ความถี่ 100 Hz ทุกครั้งที่ timer ทำงาน ระบบจะให้ semaphore เพื่อปลุก SensorTask ให้อ่านข้อมูลหนึ่งรอบ ทำให้รอบ sampling สม่ำเสมอ

**การรับสัญญาณจากปุ่ม:** ปุ่ม A และปุ่ม B ทำงานแบบ interrupt เมื่อกดปุ่มจะใช้ตัวจับเวลาระดับไมโครวินาทีทำ debounce 250 ms แล้วส่งค่าเข้าคิวของ ControlTask สำหรับดึงค่ามาเปลี่ยนสถานะการฝึก และส่งสถานะใหม่ไปยังเว็บไซต์ในรอบถัดไป นอกจากนี้ ปุ่ม A ยังใช้ปลุก ESP32 ให้ตื่นจาก Sleep Mode

**การป้องกันระบบค้าง:** ใช้ Watchdog Timer ของ ESP32 โดยตั้ง timeout ไว้ 8 วินาที และลงทะเบียน task หลักทุกตัวไว้กับ watchdog แต่ละ task จะเรียก `esp_task_wdt_reset()` ทุกรอบการทำงาน หาก task ใดไม่ตอบสนองนานเกิน 8 วินาที ระบบจะรีสตาร์ทบอร์ดโดยอัตโนมัติ

**การใช้ I2C bus ร่วมกัน:** เซนเซอร์ MPU, MAX30102, MLX90614 และจอ LCD ต่ออยู่บน I2C bus เดียวกัน เนื่องจาก bus นี้สื่อสารได้ทีละอุปกรณ์ จึงใช้ mutex ควบคุมไม่ให้หลาย task เข้าใช้ bus พร้อมกัน ซึ่งช่วยป้องกันข้อมูลชนกันและ bus ค้าง

**การรับข้อมูลจาก Arduino Uno:** ESP32 รับค่า EMG และ FSR จาก Arduino Uno ผ่าน `Serial2` ที่ขา GPIO16/17 ด้วยความเร็ว 9600 baud

**การส่งข้อมูลขึ้นเว็บไซต์:** NetworkTask นำค่าจาก Arduino Uno มารวมกับข้อมูลจากเซนเซอร์อื่นเป็น JSON ทุก 250 ms แล้วใช้ API เพื่อส่งค่าไปยังเว็บไซต์

**การประหยัดพลังงาน:** เมื่อไม่มีการใช้งานนานครบ 5 นาที ESP32 จะเข้าสู่ Light Sleep และตื่นขึ้นมาทำงานต่อเมื่อกดปุ่ม A

### 6.3.2 โค้ดและการทำงานของโค้ด

โค้ดในหัวข้อนี้ยกมาจากไฟล์ `test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino` โดยตรง บรรทัดที่ละไว้แสดงด้วย `// ...`

#### 6.3.2.1 การเริ่มต้นระบบใน `setup()`

เมื่อเปิดเครื่อง `setup()` จะเตรียมช่องทางสื่อสารก่อน แล้วจึงเริ่มเซนเซอร์บน I2C ทีละตัว

```cpp
Serial2.begin(UNO_LINK_BAUD, SERIAL_8N1, UNO_LINK_RX_PIN, UNO_LINK_TX_PIN);
Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
Wire.setClock(100000);

lcd.init();
lcd.backlight();
lcd.setCursor(0, 0);
lcd.print("Booting...");

for (int attempt = 0; attempt < 5 && !statusMpu; attempt++) {
  if (attempt > 0) delay(100);
  statusMpu = mpuBegin();
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 875–887](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L875-L887)

- `Serial2.begin(...)` เปิด UART ช่องที่ 2 สำหรับรับข้อมูลจาก Arduino Uno ที่ 9600 baud รูปแบบ 8N1 บนขา RX = GPIO16 และ TX = GPIO17
- `Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN)` เปิด I2C bus ที่ SDA = GPIO21 และ SCL = GPIO22 (กำหนดใน `board_config.h`) ด้วย clock 100 kHz
- เซนเซอร์แต่ละตัว (MPU, MAX30102, MLX90614) พยายามเริ่มต้นได้สูงสุด 5 ครั้ง ห่างกันครั้งละ 100 ms ผลลัพธ์เก็บไว้ในตัวแปร `statusMpu`, `statusMax` และ `statusMlx` ถ้าเซนเซอร์ตัวใดเริ่มไม่สำเร็จ ระบบยังทำงานต่อได้ แต่ค่าของเซนเซอร์นั้นจะเป็น 0

จากนั้นจึงเชื่อมต่อ Wi-Fi และสร้างเครื่องมือของ FreeRTOS ที่ task ต่าง ๆ ใช้ร่วมกัน

```cpp
stateMutex = xSemaphoreCreateMutex();
i2cMutex = xSemaphoreCreateMutex();
sampleTickSemaphore = xSemaphoreCreateBinary();
emgQueue = xQueueCreate(EMG_QUEUE_LEN, sizeof(int));
buttonEventQueue = xQueueCreate(8, sizeof(uint8_t));
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 926–930](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L926-L930)

| ตัวแปร | ชนิด | หน้าที่ |
|---|---|---|
| `stateMutex` | Mutex | ป้องกันการอ่าน/เขียน `SharedState` พร้อมกันจากหลาย task |
| `i2cMutex` | Mutex | ให้ใช้ I2C bus ได้ทีละ task |
| `sampleTickSemaphore` | Binary semaphore | สัญญาณจาก hardware timer เพื่อปลุก SensorTask |
| `emgQueue` | Queue 64 ช่อง | เก็บค่า EMG ทุกตัวอย่างไว้รอ NetworkTask ส่งเป็นชุด |
| `buttonEventQueue` | Queue 8 ช่อง | ส่งหมายเลขปุ่มจาก interrupt ไปให้ ControlTask |

#### 6.3.2.2 การแบ่งงานเป็น Task

ESP32 แบ่งงานออกเป็น 4 Task ที่ทำงานพร้อมกัน โดยกำหนด stack, priority และ core ของแต่ละ task ด้วย `xTaskCreatePinnedToCore()`

```cpp
xTaskCreatePinnedToCore(sensorTask, "SensorTask", 4096, nullptr, 3, &sensorTaskHandle, 1);
xTaskCreatePinnedToCore(networkTask, "NetworkTask", 8192, nullptr, 2, &networkTaskHandle, 0);
xTaskCreatePinnedToCore(lcdTask, "LcdTask", 2560, nullptr, 1, &lcdTaskHandle, 1);
xTaskCreatePinnedToCore(controlTask, "ControlTask", 2560, nullptr, 2, &controlTaskHandle, 1);
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 953–956](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L953-L956)

| Task | Stack (byte) | Priority | Core | หน้าที่ |
|---|---|---|---|---|
| `SensorTask` | 4096 | 3 (สูงสุด) | 1 | อ่านเซนเซอร์ทุก 10 ms ตาม hardware timer |
| `NetworkTask` | 8192 | 2 | 0 | สร้าง JSON และส่ง HTTP POST ทุก 250 ms |
| `LcdTask` | 2560 | 1 (ต่ำสุด) | 1 | อัปเดตจอ LCD ทุก 200 ms |
| `ControlTask` | 2560 | 2 | 1 | รับเหตุการณ์ปุ่ม ควบคุม buzzer และเข้า light sleep |

SensorTask ได้ priority สูงสุดเพราะต้องอ่านข้อมูลให้ตรงรอบ ส่วน NetworkTask แยกไปอยู่ core 0 ซึ่งเป็น core เดียวกับ Wi-Fi stack ทำให้การรอ HTTP ที่อาจใช้เวลานานไม่ไปขวางการอ่านเซนเซอร์บน core 1 และ NetworkTask ใช้ stack มากที่สุดเพราะต้องสร้าง buffer ของ payload

เมื่อสร้าง task ครบแล้ว `loop()` ของ Arduino ไม่มีงานต้องทำ จึงลบ task ของตัวเองทิ้ง

```cpp
void loop() {
  vTaskDelete(NULL);
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 966–968](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L966-L968)

#### 6.3.2.3 การจับเวลารอบ sampling ด้วย Hardware Timer

ใช้ hardware timer สร้างสัญญาณที่ความถี่ 100 Hz ทุกครั้งที่ timer ทำงาน ระบบจะให้ semaphore เพื่อปลุก SensorTask ให้อ่านข้อมูลหนึ่งรอบ ทำให้รอบ sampling สม่ำเสมอ

```cpp
sampleTimer = timerBegin(1000000);
timerAttachInterrupt(sampleTimer, &onSampleTimer);
timerAlarm(sampleTimer, SAMPLE_INTERVAL_MS * 1000, (SAMPLE_TIMER_CONFIG_MASK & TIMER_CFG_AUTORELOAD) != 0, 0);
timerStart(sampleTimer);
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 948–951](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L948-L951)

- `timerBegin(1000000)` ตั้ง timer ให้นับที่ 1 MHz หรือ 1 tick ต่อ 1 µs
- `timerAlarm(...)` ตั้งให้เกิด alarm ทุก `SAMPLE_INTERVAL_MS * 1000` = 10 × 1000 = 10,000 tick หรือ 10 ms และเปิด auto-reload ให้ timer เริ่มนับใหม่เองทุกรอบ

ฟังก์ชันที่ timer เรียกเมื่อครบรอบ (ISR) มีหน้าที่เพียงให้ semaphore

```cpp
void IRAM_ATTR onSampleTimer() {
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  xSemaphoreGiveFromISR(sampleTickSemaphore, &xHigherPriorityTaskWoken);
  if (xHigherPriorityTaskWoken) portYIELD_FROM_ISR();
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 237–241](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L237-L241)

- `IRAM_ATTR` ให้ฟังก์ชันนี้อยู่ใน RAM ภายใน เพื่อให้เรียกได้ทันทีโดยไม่ต้องรออ่านจาก flash
- `xSemaphoreGiveFromISR()` เป็นเวอร์ชันที่ใช้ใน interrupt ได้ ถ้าการให้ semaphore ทำให้ task ที่มี priority สูงกว่าตื่นขึ้น `portYIELD_FROM_ISR()` จะสลับไปทำ task นั้นทันทีหลังออกจาก interrupt

ฝั่ง SensorTask จะรอ semaphore นี้ที่ต้นลูปทุกรอบ

```cpp
void sensorTask(void *pvParameters) {
  lastMpuMicros = micros();

  for (;;) {
    xSemaphoreTake(sampleTickSemaphore, portMAX_DELAY);
    esp_task_wdt_reset();

    unsigned long now = millis();

    pollUnoLink();
    // ...
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 571–580](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L571-L580)

`portMAX_DELAY` ทำให้ task หยุดรอโดยไม่ใช้ CPU จนกว่า timer จะให้ semaphore จึงได้รอบการอ่านทุก 10 ms ตาม hardware timer แทนการใช้ `delay()`

#### 6.3.2.4 การรับข้อมูลจาก Arduino Uno ผ่าน UART

ESP32 รับค่า EMG และ FSR จาก Arduino Uno ผ่าน `Serial2` ที่ขา GPIO16/17 ด้วยความเร็ว 9600 baud Uno ส่งข้อความบรรทัดละหนึ่งรอบในรูปแบบ `emg,fsr\n` และ SensorTask เรียก `pollUnoLink()` ทุกรอบเพื่อแยกค่า

```cpp
void pollUnoLink() {
  static char lineBuf[32];
  static uint8_t lineLen = 0;

  while (Serial2.available()) {
    char c = (char)Serial2.read();
    if (c == '\n') {
      lineBuf[lineLen] = '\0';
      int emg, fsr;
      if (sscanf(lineBuf, "%d,%d", &emg, &fsr) == 2) {
        unoEmgVal = emg;
        unoFsrForce = fsr;
        lastUnoRxMs = millis();
      }
      lineLen = 0;
    } else if (c != '\r' && lineLen < sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = c;
    }
  }

  bool unoLinkOk = (millis() - lastUnoRxMs) < 500;
  // ...
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 266–291](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L266-L291)

1. อ่านตัวอักษรทีละตัวจาก buffer ของ UART และเก็บต่อท้ายใน `lineBuf` โดยข้าม `\r` และจำกัดความยาวไม่ให้เกิน buffer 32 ตัวอักษร
2. เมื่อเจอ `\n` แสดงว่าจบหนึ่งบรรทัด จึงปิดท้ายสตริงด้วย `\0` แล้วใช้ `sscanf("%d,%d")` แยกเป็นตัวเลข 2 ค่า
3. ถ้าแยกได้ครบ 2 ค่า จะบันทึกลง `unoEmgVal` และ `unoFsrForce` พร้อมเวลาที่รับได้ล่าสุด ถ้าบรรทัดเสียจะทิ้งไปทั้งบรรทัด
4. `lineBuf` และ `lineLen` เป็น `static` จึงเก็บข้อความที่รับมายังไม่ครบบรรทัดไว้ต่อในรอบถัดไปได้
5. ถ้าไม่ได้รับข้อมูลเกิน 500 ms ระบบจะถือว่าการเชื่อมต่อกับ Uno ขาด และพิมพ์แจ้งทาง Serial Monitor

หลังได้ค่าจาก Uno แล้ว SensorTask ส่งค่า EMG เข้า `emgQueue` ทุกรอบ ถ้า queue เต็มจะทิ้งค่าที่เก่าที่สุดหนึ่งค่าแล้วใส่ค่าใหม่แทน ทำให้ข้อมูลที่ส่งออกไปเป็นค่าล่าสุดเสมอ

```cpp
if (xQueueSend(emgQueue, &emgVal, 0) != pdTRUE) {
  int discarded;
  xQueueReceive(emgQueue, &discarded, 0);
  xQueueSend(emgQueue, &emgVal, 0);
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 587–591](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L587-L591)

#### 6.3.2.5 การใช้ I2C bus ร่วมกันด้วย Mutex

เซนเซอร์ MPU, MAX30102, MLX90614 และจอ LCD ต่ออยู่บน I2C bus เดียวกัน เนื่องจาก bus นี้สื่อสารได้ทีละอุปกรณ์ จึงใช้ mutex ควบคุมไม่ให้หลาย task เข้าใช้ bus พร้อมกัน ซึ่งช่วยป้องกันข้อมูลชนกันและ bus ค้าง ใน SensorTask การอ่านเซนเซอร์ I2C ทั้งหมดอยู่ระหว่าง `xSemaphoreTake(i2cMutex)` และ `xSemaphoreGive(i2cMutex)`

```cpp
if (xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
  if (statusMpu) updateMpu(now);

  if (statusMax) {
    max30102.check();

    while (max30102.available()) {
      long irValue = max30102.getFIFOIR();
      long redValue = max30102.getFIFORed();
      // ...
      max30102.nextSample();
    }
  }

  if (statusMlx && now - lastMlxReadMs >= MLX_READ_INTERVAL_MS) {
    lastMlxReadMs = now;
    float t = mlx.readObjectTempC();
    if (!isnan(t)) {
      skinTemp = t;
      deltaTemp = skinTemp - skinTempBaseline;
    }
  }

  xSemaphoreGive(i2cMutex);
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 594–638](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L594-L638)

- รอ mutex ได้ไม่เกิน 20 ms ถ้ายังไม่ได้ (เช่น LcdTask กำลังเขียนจออยู่) จะข้ามการอ่าน I2C ในรอบนั้นไป แทนที่จะรอค้าง
- อ่าน MPU ทุกรอบ (10 ms) เพื่อคำนวณความเร็ว
- ดึงข้อมูลทุกตัวที่ค้างอยู่ใน FIFO ของ MAX30102 จนหมดทุกรอบ เพื่อคำนวณ HR และ SpO2
- อ่าน MLX90614 เพียงทุก 250 ms (`MLX_READ_INTERVAL_MS`) เพราะอุณหภูมิผิวเปลี่ยนช้า การอ่านถี่ ๆ จึงไม่จำเป็นและเสียเวลาบน bus

การอ่าน register ของ MPU ในระดับล่างใช้ `Wire` โดยตรง ตัวอย่างเช่นฟังก์ชันอ่าน register หนึ่งไบต์

```cpp
uint8_t mpuReadReg(uint8_t reg) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)1);
  return Wire.available() ? Wire.read() : 0xFF;
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 293–299](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L293-L299)

ขั้นตอนคือส่งหมายเลข register ไปยังอุปกรณ์ที่ address `0x68` แล้วใช้ `endTransmission(false)` เพื่อส่ง repeated start โดยยังไม่ปล่อย bus จากนั้นจึงขออ่านข้อมูลกลับ 1 ไบต์ ถ้าไม่มีข้อมูลตอบกลับจะคืนค่า `0xFF`

เมื่ออ่านเซนเซอร์เสร็จ SensorTask จะใช้ `stateMutex` คัดลอกค่าทั้งหมดลง `SharedState` เพื่อให้ task อื่นนำไปใช้ต่อ

```cpp
if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(20)) == pdTRUE) {
  shared.fsrLatest = fsrVal;
  shared.fsrStability = stability;
  shared.velocity = velocity;
  if (velocity > shared.peakVelocity) shared.peakVelocity = velocity;
  shared.beatAvg = beatAvg;
  shared.spo2Estimate = spo2Estimate;
  shared.skinTemp = skinTemp;
  shared.deltaTemp = deltaTemp;
  xSemaphoreGive(stateMutex);
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 640–650](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L640-L650)

#### 6.3.2.6 การรับสัญญาณจากปุ่มด้วย GPIO Interrupt

ปุ่ม A (GPIO32) และปุ่ม B (GPIO33) ทำงานแบบ interrupt ใน `setup()` ตั้งค่าขาทั้งสองพร้อมกันด้วย `gpio_config()`

```cpp
gpio_config_t buttonIoConf = {};
buttonIoConf.pin_bit_mask = BUTTON_PIN_BIT_MASK;
buttonIoConf.mode = GPIO_MODE_INPUT;
buttonIoConf.pull_up_en = GPIO_PULLUP_ENABLE;
buttonIoConf.pull_down_en = GPIO_PULLDOWN_DISABLE;
buttonIoConf.intr_type = GPIO_INTR_NEGEDGE;
gpio_config(&buttonIoConf);

gpio_install_isr_service(0);
gpio_isr_handler_add((gpio_num_t)BUTTON_A_PIN, buttonA_isr, nullptr);
gpio_isr_handler_add((gpio_num_t)BUTTON_B_PIN, buttonB_isr, nullptr);
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 936–946](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L936-L946)

- `BUTTON_PIN_BIT_MASK` คือ `(1ULL << 32) | (1ULL << 33)` เลือกขา GPIO32 และ GPIO33
- เปิด pull-up ภายใน ขาจึงเป็น HIGH ตอนไม่กด และเป็น LOW ตอนกด
- `GPIO_INTR_NEGEDGE` ให้เกิด interrupt ตอนสัญญาณเปลี่ยนจาก HIGH เป็น LOW หรือตอนเริ่มกดปุ่ม

เมื่อกดปุ่ม ISR จะใช้ตัวจับเวลาระดับไมโครวินาทีทำ debounce 250 ms แล้วส่งหมายเลขปุ่มเข้าคิวของ ControlTask

```cpp
void IRAM_ATTR buttonA_isr(void *arg) {
  int64_t now = esp_timer_get_time();
  if (now - lastButtonAIsrUs < (int64_t)BUTTON_DEBOUNCE_US) return;
  lastButtonAIsrUs = now;
  uint8_t id = 0;
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  xQueueSendFromISR(buttonEventQueue, &id, &xHigherPriorityTaskWoken);
  if (xHigherPriorityTaskWoken) portYIELD_FROM_ISR();
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 246–254](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L246-L254)

`esp_timer_get_time()` คืนเวลาเป็นไมโครวินาทีนับจากบูต ถ้า interrupt ครั้งนี้ห่างจากครั้งก่อนไม่ถึง `BUTTON_DEBOUNCE_US` (250,000 µs) จะถือว่าเป็นสัญญาณเด้งของหน้าสัมผัสปุ่มและไม่ส่งต่อ ส่วน `buttonB_isr()` ทำงานแบบเดียวกันแต่ส่งค่า `id = 1`

ControlTask รับหมายเลขปุ่มจากคิว แล้วตรวจสอบซ้ำอีกชั้นก่อนเปลี่ยนสถานะการฝึก

```cpp
uint8_t buttonId;
if (xQueueReceive(buttonEventQueue, &buttonId, pdMS_TO_TICKS(100)) == pdTRUE && buttonId < 2) {
  vTaskDelay(pdMS_TO_TICKS(BUTTON_SETTLE_MS));
  bool isRealPress = buttonArmed[buttonId] && gpio_get_level(buttonPins[buttonId]) == 0;
  if (isRealPress) buttonArmed[buttonId] = false;

  unsigned long pressNow = millis();
  if (isRealPress && xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
    if (buttonId == 0) {
      shared.setActive = !shared.setActive;
      if (shared.setActive) {
        shared.setStartMs = pressNow;
        shared.setCount++;
      } else {
        shared.restStartMs = pressNow;
      }
      shared.buttonAEventPending = true;
    } else {
      shared.setActive = false;
      shared.restStartMs = pressNow;
      shared.setCount = 0;
      shared.buttonBEventPending = true;
    }
    shared.lastActivityMs = pressNow;
    xSemaphoreGive(stateMutex);
  }
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 787–813](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L787-L813)

1. รอ 30 ms (`BUTTON_SETTLE_MS`) ให้สัญญาณนิ่ง แล้วอ่านขาอีกครั้ง ถ้ายังเป็น LOW จึงถือว่ากดจริง
2. `buttonArmed` ป้องกันการนับซ้ำขณะกดค้าง ปุ่มจะกลับมานับได้อีกเมื่อปล่อยปุ่มแล้ว (ขาเป็น HIGH) ซึ่งตรวจที่ต้นลูปของ ControlTask
3. ปุ่ม A สลับระหว่างเริ่มเซตและพักเซต เมื่อเริ่มเซตใหม่จะเพิ่มจำนวนเซต ส่วนปุ่ม B หยุดการฝึกและรีเซ็ตจำนวนเซตเป็น 0
4. ตั้ง `buttonAEventPending` หรือ `buttonBEventPending` ไว้ เพื่อให้ NetworkTask ส่งเหตุการณ์ปุ่มไปยังเว็บไซต์ในรอบถัดไป

นอกจากนี้ ControlTask ยังรับหน้าที่ควบคุม buzzer ตามค่า FSR และตรวจเวลาที่ไม่มีการใช้งานเพื่อเข้า Sleep Mode (หัวข้อ 6.3.2.9)

#### 6.3.2.7 การป้องกันระบบค้างด้วย Watchdog Timer

ใช้ Task Watchdog Timer ของ ESP32 โดยตั้ง timeout ไว้ 8 วินาที (`WATCHDOG_TIMEOUT_S = 8`)

```cpp
void initWatchdog() {
  esp_task_wdt_config_t twdt_config = {
    .timeout_ms = (uint32_t)(WATCHDOG_TIMEOUT_S * 1000),
    .idle_core_mask = 0,
    .trigger_panic = true,
  };
  if (esp_task_wdt_init(&twdt_config) != ESP_OK) {
    esp_task_wdt_reconfigure(&twdt_config);
  }
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 520–529](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L520-L529)

- `trigger_panic = true` ทำให้ระบบ panic และรีสตาร์ทบอร์ดเมื่อ watchdog หมดเวลา
- `idle_core_mask = 0` ไม่ได้ให้ watchdog เฝ้า idle task ของ core ใด แต่เฝ้าเฉพาะ task ที่ลงทะเบียนเอง
- ESP32 Arduino core อาจเปิด watchdog ไว้ก่อนแล้ว ถ้า `esp_task_wdt_init()` ไม่สำเร็จจึงใช้ `esp_task_wdt_reconfigure()` เปลี่ยนค่าแทน

หลังสร้าง task ครบ `setup()` จะลงทะเบียน task หลักทุกตัวไว้กับ watchdog

```cpp
esp_task_wdt_add(sensorTaskHandle);
esp_task_wdt_add(networkTaskHandle);
esp_task_wdt_add(lcdTaskHandle);
esp_task_wdt_add(controlTaskHandle);
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 958–961](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L958-L961)

แต่ละ task เรียก `esp_task_wdt_reset()` ทุกรอบการทำงาน เช่นต้นลูปของ SensorTask, LcdTask และ ControlTask ส่วน NetworkTask เรียกทั้งต้นลูปและหลัง `http.POST()` เพราะการส่ง HTTP อาจใช้เวลานาน หาก task ใดไม่ตอบสนองนานเกิน 8 วินาที ระบบจะรีสตาร์ทบอร์ดโดยอัตโนมัติ

#### 6.3.2.8 การส่งข้อมูลขึ้นเว็บไซต์ใน NetworkTask

NetworkTask นำค่าจาก Arduino Uno มารวมกับข้อมูลจากเซนเซอร์อื่นเป็น JSON ทุก 250 ms แล้วส่งไปยัง API `POST /api/telemetry` ของเว็บไซต์ ก่อนเริ่มลูป `setup()` เตรียม `HTTPClient` ไว้หนึ่งครั้ง

```cpp
void setupHttpClient() {
  http.end();
  http.begin(httpClient, serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.setReuse(true);
  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_READ_TIMEOUT_MS);
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 213–220](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L213-L220)

`setReuse(true)` ให้ใช้การเชื่อมต่อ TCP เดิมซ้ำ (keep-alive) ไม่ต้องเปิดการเชื่อมต่อใหม่ทุก 250 ms และตั้ง timeout การเชื่อมต่อ 1.5 วินาที กับการรอคำตอบ 3 วินาที เพื่อไม่ให้ task รอนานจนชน watchdog

ในแต่ละรอบ NetworkTask ทำงานดังนี้

```cpp
for (;;) {
  vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(SEND_INTERVAL_MS));
  esp_task_wdt_reset();

  if (WiFi.status() != WL_CONNECTED) continue;

  if (consecutiveFailures >= HTTP_MAX_CONSECUTIVE_FAILURES && (int32_t)(xTaskGetTickCount() - retryAfter) < 0) {
    continue;
  }

  char emgArray[400];
  int pos = snprintf(emgArray, sizeof(emgArray), "[");
  int sentBatchSize = 0;
  int sample;
  while (xQueueReceive(emgQueue, &sample, 0) == pdTRUE) {
    pos += snprintf(emgArray + pos, sizeof(emgArray) - pos, "%s%d", sentBatchSize == 0 ? "" : ",", sample);
    sentBatchSize++;
    if (pos >= (int)sizeof(emgArray) - 8) break;
  }
  snprintf(emgArray + pos, sizeof(emgArray) - pos, "]");
  // ...
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 671–690](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L671-L690)

1. `vTaskDelayUntil()` ทำให้ task ตื่นทุก 250 ms นับจากเวลาตื่นครั้งก่อน รอบการส่งจึงไม่เลื่อนออกไปตามเวลาที่ใช้ประมวลผล
2. ถ้า Wi-Fi ยังไม่เชื่อมต่อ หรือส่งไม่สำเร็จติดกันครบ 3 ครั้งและยังไม่พ้นช่วงพัก 1 วินาที (backoff) จะข้ามรอบนี้ไป
3. ดึงค่า EMG ทั้งหมดที่สะสมใน `emgQueue` ออกมาต่อกันเป็น JSON array เช่น `[512,530,498,...]` ที่ 100 Hz รอบละ 250 ms จะได้ประมาณ 25 ค่า โดยหยุดก่อน buffer 400 ตัวอักษรเต็ม

จากนั้นคัดลอก `SharedState` ทั้งก้อนออกมาภายใต้ `stateMutex` แล้วสร้าง payload

```cpp
SharedState snap;
bool sentButtonA = false, sentButtonB = false;
if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
  snap = shared;
  shared.peakVelocity = shared.velocity;
  sentButtonA = shared.buttonAEventPending;
  sentButtonB = shared.buttonBEventPending;
  shared.buttonAEventPending = false;
  shared.buttonBEventPending = false;
  xSemaphoreGive(stateMutex);
}

char payload[768];
snprintf(payload, sizeof(payload),
         "{\"board\":\"esp32\","
         "\"emg\":{\"raw\":%s},"
         "\"fsr\":{\"force\":%d,\"stability\":%.1f},"
         "\"mpu\":{\"velocity\":%.3f,\"peakVelocity\":%.3f},"
         "\"vitals\":{\"hr\":%d,\"spo2\":%.1f,\"skinTemp\":%.2f,\"deltaTemp\":%.2f},"
         "\"buttons\":{\"a\":%s,\"b\":%s}}",
         emgArray, snap.fsrLatest, snap.fsrStability,
         snap.velocity, snap.peakVelocity,
         snap.beatAvg, snap.spo2Estimate, snap.skinTemp, snap.deltaTemp,
         sentButtonA ? "true" : "false", sentButtonB ? "true" : "false");
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 692–715](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L692-L715)

- การคัดลอกเป็น `snap` ทำให้ถือ mutex เพียงช่วงสั้น ๆ แล้วนำค่าไปสร้าง JSON นอก mutex ได้ SensorTask จึงไม่ต้องรอนาน
- `peakVelocity` ถูกรีเซ็ตเป็นความเร็วปัจจุบันหลังคัดลอก จึงเป็นค่าสูงสุดของแต่ละรอบ 250 ms
- สถานะปุ่มถูกล้างทันทีหลังคัดลอก เพื่อไม่ให้ส่งเหตุการณ์กดปุ่มเดิมซ้ำในรอบถัดไป
- ใช้ `snprintf()` สร้าง JSON ลงใน buffer ขนาดคงที่ 768 ไบต์ โดยไม่ใช้ไลบรารี JSON จึงไม่ต้องจองหน่วยความจำเพิ่มระหว่างทำงาน

ตัวอย่าง payload ที่ได้

```json
{"board":"esp32","emg":{"raw":[512,530,498]},"fsr":{"force":1820,"stability":92.5},"mpu":{"velocity":0.215,"peakVelocity":0.340},"vitals":{"hr":88,"spo2":97.5,"skinTemp":33.10,"deltaTemp":0.45},"buttons":{"a":false,"b":false}}
```

สุดท้ายส่ง payload และจัดการผลลัพธ์

```cpp
int code = http.POST(payload);
esp_task_wdt_reset();
// ...
if (code > 0) {
  consecutiveFailures = 0;
  applyServerReply(http.getString());
  // ...
} else {
  if (consecutiveFailures < 255) consecutiveFailures++;
  // ...
  setupHttpClient();

  if (consecutiveFailures >= HTTP_MAX_CONSECUTIVE_FAILURES) {
    retryAfter = xTaskGetTickCount() + pdMS_TO_TICKS(HTTP_BACKOFF_MS);
    // ...
  }

  if (sentButtonA || sentButtonB) {
    if (xSemaphoreTake(stateMutex, pdMS_TO_TICKS(50)) == pdTRUE) {
      shared.buttonAEventPending |= sentButtonA;
      shared.buttonBEventPending |= sentButtonB;
      xSemaphoreGive(stateMutex);
    }
  }
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 718–751](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L718-L751)

- ถ้าส่งสำเร็จ (`code > 0`) จะรีเซ็ตตัวนับความผิดพลาด แล้วส่งคำตอบจากเซิร์ฟเวอร์ให้ `applyServerReply()` อ่านค่า calibration ของ FSR (`fsrZero`, `fsrMax`) และคำสั่งทดสอบ buzzer (`beep`) ที่ผู้ใช้ตั้งจากหน้าเว็บ
- ถ้าส่งไม่สำเร็จ จะเตรียม `HTTPClient` ใหม่ และเมื่อผิดพลาดติดกันครบ 3 ครั้งจะพักการส่ง 1 วินาที เพื่อไม่ให้ส่งซ้ำถี่ ๆ ขณะเซิร์ฟเวอร์ติดต่อไม่ได้
- เหตุการณ์ปุ่มที่ส่งไม่สำเร็จจะถูกคืนกลับเข้า `SharedState` เพื่อส่งอีกครั้งในรอบถัดไป เหตุการณ์กดปุ่มจึงไม่หายไประหว่างที่เครือข่ายมีปัญหา

#### 6.3.2.9 การประหยัดพลังงานด้วย Light Sleep

ControlTask ตรวจเวลาที่ไม่มีการใช้งาน ถ้าอยู่ในสถานะยังไม่เริ่มฝึก (ยังไม่เริ่มเซตแรก หรือกดปุ่ม B รีเซ็ตแล้ว) และไม่มีการกดปุ่มนานครบ 5 นาที (`IDLE_SLEEP_TIMEOUT_MS`) จะเรียก `enterLightSleepUntilWake()`

```cpp
void enterLightSleepUntilWake() {
  // ...
  WiFi.disconnect(true);

  esp_task_wdt_delete(sensorTaskHandle);
  esp_task_wdt_delete(networkTaskHandle);
  esp_task_wdt_delete(lcdTaskHandle);
  esp_task_wdt_delete(controlTaskHandle);
  esp_task_wdt_deinit();

  if (SLEEP_WAKE_SOURCE_MASK & WAKE_SRC_EXT0) {
    esp_sleep_enable_ext0_wakeup((gpio_num_t)BUTTON_A_PIN, 0  );
  }
  if (SLEEP_WAKE_SOURCE_MASK & WAKE_SRC_TIMER) {
    esp_sleep_enable_timer_wakeup(IDLE_WAKE_KEEPALIVE_US);
  }

  esp_light_sleep_start();

  // ...
  initWatchdog();
  esp_task_wdt_add(sensorTaskHandle);
  esp_task_wdt_add(networkTaskHandle);
  esp_task_wdt_add(lcdTaskHandle);
  esp_task_wdt_add(controlTaskHandle);

  connectWiFi();
}
```

ดูโค้ดต้นฉบับ: [`esp32_workout_firmware.ino` บรรทัด 531–569](https://github.com/Fishcanwalk/muscle-activity-analyzer/blob/3c3f71f/test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino#L531-L569)

1. แสดงข้อความ `SLEEPING...` บน LCD และตัดการเชื่อมต่อ Wi-Fi
2. ถอด task ทั้งหมดออกจาก watchdog และปิด watchdog ก่อน เพราะระหว่าง sleep ไม่มี task ใดเรียก `esp_task_wdt_reset()` ได้ ถ้าไม่ปิดไว้ บอร์ดจะถูกรีสตาร์ทหลังตื่น
3. ตั้งแหล่งปลุก 2 แบบ คือ ext0 ที่ปุ่ม A (GPIO32 เป็น LOW หรือตอนกดปุ่ม) และ timer ที่ปลุกเมื่อครบ 5 วินาที (`IDLE_WAKE_KEEPALIVE_US`)
4. `esp_light_sleep_start()` หยุด CPU ไว้ที่บรรทัดนี้จนกว่าจะถูกปลุก โดยค่าใน RAM ยังอยู่ครบ เมื่อตื่นแล้วจึงทำงานต่อจากบรรทัดถัดไปได้ทันที
5. หลังตื่น เปิด watchdog และลงทะเบียน task ใหม่ แล้วเชื่อมต่อ Wi-Fi อีกครั้ง จากนั้น ControlTask ตั้ง `lastActivityMs` เป็นเวลาปัจจุบัน ระบบจึงเริ่มนับเวลาไม่มีการใช้งานใหม่อีก 5 นาทีก่อนเข้า sleep รอบถัดไป

ใช้ [`../flowchart.md`](../flowchart.md) Flowchart 3 เป็นรูปประกอบหัวข้อนี้

## 6.4 เว็บและเซิร์ฟเวอร์: รับ telemetry, กระจาย SSE, เริ่ม/หยุดบันทึก, ส่งต่อ FastAPI และเก็บ MongoDB

Frontend route `POST /api/telemetry` รับ JSON จาก ESP32 แล้วเรียก `serverTelemetry.ingestFullTelemetry()` ส่วน `GET /api/telemetry/stream` ส่ง initial state และ event แบบ `telemetry` หรือ `button` ผ่าน SSE ให้ browser

`telemetryStore` เก็บ raw buffer และสถานะล่าสุด คำนวณ EMG/FSR ที่ใช้แสดงผล และเรียก `forwardToBackend()` เพื่อส่งข้อมูลไป FastAPI ด้วย service token ฝั่ง backend มี `POST /v1/telemetry` สำหรับ machine-to-machine และ `GET /v1/telemetry` สำหรับ history ของผู้ใช้ที่ login แล้ว

การเริ่ม/หยุดบันทึกใช้ `POST /api/recording` โดย frontend ตรวจสอบผู้ใช้ผ่าน FastAPI client และมี recording slot เดียวต่อ hardware rig ส่วน calibration proxy เรียก `GET/POST /v1/calibration` แล้ว mirror ค่ากลับเข้า in-memory store

FastAPI สร้าง index ตอนเริ่มแอปและใช้ Motor เชื่อม MongoDB การสร้าง session result เขียนลง `session_results` ขณะที่ telemetry เขียนลง `telemetry_samples`

## 6.5 เส้นทางข้อมูลแบบครบวงจรและตัวอย่างโค้ดสำคัญ

เส้นทางข้อมูลหนึ่งรอบเริ่มจาก `ISR(TIMER1_COMPA_vect)` ของ Uno ตั้ง flag → ADC interrupt อ่าน A0/A1 → `Serial.print()` ส่งข้อความ → ESP32 `pollUnoLink()` parse บรรทัด → `SensorTask` อัปเดต `SharedState` → `NetworkTask` สร้าง JSON → `http.POST(payload)` → frontend `ingestFullTelemetry()` → SSE และ `forwardToBackend()` → FastAPI insert MongoDB

ตัวอย่างจุดสำคัญที่ควรนำไปแสดงในรายงานฉบับเต็ม:

- การตั้ง Timer1 และ ADC ISR ใน `uno_emg_fsr_link.ino`
- การ parse `emg,fsr` และการอ่าน I2C ใน `esp32_workout_firmware.ino`
- การสร้าง telemetry payload ใน NetworkTask
- การ broadcast event ใน `frontend/src/routes/api/telemetry/stream/+server.ts`
- การ insert ใน `backend/app/routers/telemetry.py`

ใช้ [`../flowchart.md`](../flowchart.md) Flowchart 1 เป็นรูปสรุปเส้นทางข้อมูล และ Flowchart 2-3 เป็นรายละเอียดฝั่งไมโครคอนโทรลเลอร์

แหล่งข้อมูล: โครงสร้างไฟล์ใน `backend/`, `frontend/` และ `test-sensor/arduino/`, `test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino`, `test-sensor/arduino/uno_emg_fsr_link/board_config.h`, `test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino`, `test-sensor/arduino/esp32_workout_firmware/board_config.h`, `PINS.md`, `TROUBLESHOOTING.md`, `frontend/src/routes/api/telemetry/`, `frontend/src/routes/api/recording/+server.ts`, `frontend/src/routes/api/calibration/+server.ts`, `frontend/src/lib/server/telemetryStore.ts`, `backend/app/`, `README.md`
