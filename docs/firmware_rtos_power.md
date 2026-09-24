# ⚙️ Sensor Rig Firmware: FreeRTOS / AVR-Native Sleep, Timer, Interrupt, Watchdog

เอกสารนี้อธิบายการปรับสถาปัตยกรรมของเฟิร์มแวร์ทั้ง 2 บอร์ดในชุดเซนเซอร์ (ESP32 + Arduino Uno) ให้
สาธิต 5 กลไกที่โปรเจกต์วิชา Embedded Systems กำหนด: **Sleep Mode**, **Interrupt**,
**Watchdog Timer**, **Hardware Timer/Counter**, และ **RTOS** — แต่ละบอร์ดใช้วิธีที่เหมาะกับฮาร์ดแวร์
ของตัวเอง ไม่ใช่ copy-paste เดียวกันทั้งคู่:

- **ESP32** ([หัวข้อด้านล่าง](#esp32-freertos-tasks-hardware-timer-interrupts-watchdog-light-sleep)):
  รันอยู่บน **FreeRTOS** อยู่แล้วใต้ Arduino core — ปรับ `esp32_workout_firmware` จาก `loop()` เดี่ยว
  แบบ cooperative polling ให้เป็นระบบหลายทาสก์
- **Arduino Uno** ([หัวข้อท้ายเอกสาร](#arduino-uno-avr-native-sleep-timer-interrupt-watchdog-no-rtos)):
  ชิป ATmega328P (2KB RAM) ไม่รองรับ FreeRTOS ในทางปฏิบัติ — ใช้ AVR-native API ตรงๆ
  (Timer1 CTC, ADC interrupt, `<avr/sleep.h>`, `<avr/wdt.h>`) แทน ไม่มีหัวข้อ RTOS สำหรับบอร์ดนี้
  เพราะไม่เหมาะกับฮาร์ดแวร์ระดับนี้

## ESP32: FreeRTOS Tasks, Hardware Timer, Interrupts, Watchdog, Light Sleep

ไฟล์ที่แก้ไข: [`test-sensor/src/esp32_workout_firmware.cpp`](../test-sensor/src/esp32_workout_firmware.cpp)
(source ที่ PlatformIO build จริงผ่าน env `esp32_wifi_buttons`) และไฟล์คู่แฝดสำหรับ Arduino IDE ที่
[`test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino`](../test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino)
(สองไฟล์นี้ต้อง sync กันแบบ manual copy-paste เหมือนเดิม ไม่มี build script ผูกไว้ — ดูหมายเหตุท้ายเอกสาร)

> 🧩 **หลักการตั้งค่า:** ทั้ง Timer, Interrupt (GPIO), และ Sleep wake source ทั้ง 3 กลไกในเอกสารนี้
> ถูกตั้งค่าผ่าน **bitmask** ทั้งหมด (`gpio_config_t.pin_bit_mask` สำหรับ interrupt,
> `SLEEP_WAKE_SOURCE_MASK` สำหรับ sleep, `SAMPLE_TIMER_CONFIG_MASK` สำหรับ timer) แทนที่จะเป็น
> boolean/ค่าคงที่แยกกันแต่ละจุด — ดูหัวข้อของแต่ละกลไกด้านล่างสำหรับรายละเอียด bitmask ที่ใช้จริง

### ก่อน vs หลัง

| | ก่อน (เดิม) | หลัง (ใหม่) |
|---|---|---|
| โครงสร้างหลัก | `loop()` เดียว วน polling ด้วย `millis()` gate ทุกอย่าง | 4 FreeRTOS tasks แยกหน้าที่ กระจาย 2 core |
| จังหวะ sample 100Hz | เทียบ `millis() - lastSampleMs >= 10` ทุกรอบ | Hardware timer (`hw_timer_t`) ยิง ISR ทุก 10ms ให้ semaphore |
| ปุ่มกด | Poll `digitalRead()` ทุก tick + debounce ด้วย timestamp | GPIO interrupt (`attachInterrupt`, FALLING) + debounce ใน ISR |
| การป้องกันค้าง (hang) | ไม่มี | ESP-IDF Task Watchdog (`esp_task_wdt`), panic+reboot ถ้าทาสก์ไหนเงียบเกิน 5 วิ |
| การประหยัดพลังงาน | ไม่มี — วน 100Hz ตลอดแม้ไม่ได้ใช้งาน | Light sleep เมื่อ idle จริงจังนานเกิน 5 นาที (ไม่ใช่แค่พักระหว่างเซต) |
| WiFi POST บล็อกอะไรไหม | บล็อก loop() ทั้งก้อน 80-110ms ทุกครั้งที่ส่ง | อยู่ใน `NetworkTask` แยก core (core 0) — ไม่กระทบ `SensorTask` (core 1) เลย |

### สถาปัตยกรรม 4 Tasks

| Task | Core | Priority | Stack | หน้าที่ |
|---|---|---|---|---|
| `SensorTask` | 1 | 3 (สูงสุด) | 4096 B | ถูกปลุกทุก 10ms โดย semaphore จาก hardware timer ISR — อ่าน UART จาก Uno (EMG/FSR), MPU6050/6500 (pitch/roll/velocity), MAX30102 (HR/SpO2), MLX90614 (skin temp) แล้ว publish snapshot ล่าสุดเข้า `shared` struct + ดัน EMG sample เข้า queue |
| `NetworkTask` | 0 | 2 | 8192 B | ทุก 250ms: ดึงทุก EMG sample ที่ค้างใน queue มา batch, อ่าน snapshot ล่าสุดจาก `shared`, ยิง `HTTPClient.POST()` ไป `/api/telemetry` — อยู่คนละ core กับ `SensorTask` เพื่อไม่ให้ POST ที่ block นาน 80-110ms ไปแย่งเวลาการ sample 100Hz |
| `LcdTask` | 1 | 1 (ต่ำสุด) | 2560 B | ทุก 200ms วาดจอ LCD 16x2 (เลขเซต + เวลานับ) จาก snapshot สถานะเซต |
| `ControlTask` | 1 | 2 | 2560 B | รอ event จากคิวปุ่มกด (มาจาก ISR), จัดการ state เริ่ม/จบเซต, รัน logic บัซเซอร์ทุกรอบ (แม้ไม่มีปุ่มกด), และตรวจสอบเงื่อนไข idle เพื่อเข้า light sleep |

Arduino เองก็รัน `setup()`/`loop()` เป็น FreeRTOS task อยู่แล้ว (`loopTask`, core 1) — โค้ดนี้แค่เพิ่มอีก
4 tasks บน OS เดิม ไม่ได้ "เพิ่ม OS" ใหม่ ค่าใช้จ่าย RAM ทั้งหมด (stack ของ 4 tasks + คิว/ semaphore)
อยู่ที่ประมาณ 15-18KB จาก free heap ที่มีอยู่ราว 200-260KB หลัง WiFi init (ดูตัวเลขจริงจาก log
`[BOOT] Free heap ...` ตอนบูต) — ผลการ build จริงบนเครื่องนี้: **RAM ใช้ 14.4% (47,096 / 327,680
bytes), Flash 65.0%** (จาก `pio run -e esp32_wifi_buttons`)

### กลไกการซิงโครไนซ์ (สิ่งที่ทำให้เป็น "RTOS" จริง ไม่ใช่แค่หลาย loop คู่ขนาน)

- **`stateMutex`** (mutex) — ป้องกัน struct `SharedState` ก้อนเดียวที่รวมทั้ง sensor snapshot
  (เขียนโดย `SensorTask`) และ workout/button state (เขียนโดย `ControlTask`) เหตุผลที่ใช้ mutex
  เดียวแทนที่จะแยกหลายตัว: contention ต่ำมาก (producer 100Hz + reader 2-3 ตัวที่ hold lock สั้นๆ)
  การรวมเป็นก้อนเดียวทำให้อ่านง่าย ไม่ over-engineer เกินความจำเป็นของโปรเจกต์ขนาดนี้
- **`i2cMutex`** (mutex) — ข้อควรระวังสำคัญที่เกิดจากการแตกเป็นหลาย task: บัส I2C (`Wire`) ถูกใช้ทั้งจาก
  `SensorTask` (MPU/MAX30102/MLX90614) และ `LcdTask` (จอ LCD ผ่าน `LiquidCrystal_I2C`) ซึ่งเป็นคนละ
  task กัน — `TwoWire` ไม่ thread-safe ถ้าถูกเรียกพร้อมกันจาก 2 tasks ตัวนี้ป้องกันไม่ให้ transaction
  I2C ของ task หนึ่งไปแทรกกลางของอีก task หนึ่ง (ในโค้ดเดิมที่มี `loop()` เดียว ปัญหานี้ไม่เคยเกิดเพราะ
  ทุกอย่างรันทีละอย่างอยู่แล้วโดยธรรมชาติ)
- **`emgQueue`** (FreeRTOS queue) — `SensorTask` ดัน EMG sample เข้าคิวทุก 10ms, `NetworkTask` ดึง
  ออกทั้งหมดทุก 250ms มา batch แทนที่ array + counter แบบเดิม เข้ากับรูปแบบ producer/consumer
  ของ RTOS โดยธรรมชาติ
- **`buttonEventQueue`** (FreeRTOS queue) — ISR ของปุ่ม (`buttonA_isr`/`buttonB_isr`) ดันรหัสปุ่มเข้าคิว
  (`xQueueSendFromISR`), `ControlTask` เป็นคนดึงออกมาประมวลผล — ISR เองทำงานสั้นที่สุดเท่าที่จะทำได้
  (เช็ค timestamp debounce แล้วดันคิว) ไม่มี I2C/Serial/delay ใน ISR
- **`sampleTickSemaphore`** (binary semaphore) — hardware timer ISR (`onSampleTimer`) ให้
  semaphore นี้ทุก 10ms, `SensorTask` block รอ (`xSemaphoreTake(..., portMAX_DELAY)`) แทนการ
  poll `millis()`

### Hardware Timer/Counter — กำหนดค่าด้วย Bitmask

```cpp
#define TIMER_CFG_EDGE_INTERRUPT (1 << 0) // 1 = edge-triggered ISR, 0 = level-triggered
#define TIMER_CFG_AUTORELOAD     (1 << 1) // 1 = alarm auto-reloads (periodic), 0 = one-shot
const uint8_t SAMPLE_TIMER_CONFIG_MASK = TIMER_CFG_EDGE_INTERRUPT | TIMER_CFG_AUTORELOAD;

#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
sampleTimer = timerBegin(1000000); // 1MHz tick = 1us resolution
timerAttachInterrupt(sampleTimer, &onSampleTimer);
timerAlarm(sampleTimer, SAMPLE_INTERVAL_MS * 1000, (SAMPLE_TIMER_CONFIG_MASK & TIMER_CFG_AUTORELOAD) != 0, 0);
timerStart(sampleTimer);
#else
sampleTimer = timerBegin(0, 80, true); // timer 0, 80MHz/80 = 1MHz tick (1us resolution)
timerAttachInterrupt(sampleTimer, &onSampleTimer, (SAMPLE_TIMER_CONFIG_MASK & TIMER_CFG_EDGE_INTERRUPT) != 0);
timerAlarmWrite(sampleTimer, SAMPLE_INTERVAL_MS * 1000, (SAMPLE_TIMER_CONFIG_MASK & TIMER_CFG_AUTORELOAD) != 0);
timerAlarmEnable(sampleTimer);
#endif
```

พฤติกรรมของ timer (edge-triggered หรือ level-triggered, one-shot หรือ autoreload) มาจากการเช็ค
บิตใน `SAMPLE_TIMER_CONFIG_MASK` แทนที่จะ hardcode ค่า `true`/`false` ตรงๆ ที่จุดเรียกใช้ — รองรับทั้ง ESP32 Core 2.x และ Core 3.x (ESP-IDF v5)
เปลี่ยนพฤติกรรมได้แค่แก้ค่าคงที่จุดเดียว `onSampleTimer()` (ISR) ทำแค่ `xSemaphoreGiveFromISR()` —
เปลี่ยนพฤติกรรมได้แค่แก้ค่าคงที่จุดเดียว `onSampleTimer()` (ISR) ทำแค่ `xSemaphoreGiveFromISR()` —
งานหนักทั้งหมดอยู่ใน `SensorTask` ที่ตื่นมาทำงานเมื่อ semaphore มา นี่คือส่วนที่แทนที่การเทียบ
`millis()` แบบเดิมด้วย hardware timer/counter จริง

### Interrupts (ปุ่มกด) — กำหนดค่าด้วย Bitmask

แทนที่จะใช้ `pinMode()` + `attachInterrupt()` ของ Arduino (ตั้งค่าทีละขา ซ่อน bitmask ไว้ข้างใน)
โค้ดนี้เรียก ESP-IDF native API ตรงๆ ซึ่งตั้งค่า**สองปุ่มพร้อมกันในการเรียกครั้งเดียว**ผ่าน
`gpio_config_t.pin_bit_mask` (1 บิต = 1 GPIO):

```cpp
#define BUTTON_BIT_A (1ULL << BUTTON_A_PIN) // GPIO32
#define BUTTON_BIT_B (1ULL << BUTTON_B_PIN) // GPIO33
const uint64_t BUTTON_PIN_BIT_MASK = BUTTON_BIT_A | BUTTON_BIT_B;

gpio_config_t buttonIoConf = {};
buttonIoConf.pin_bit_mask = BUTTON_PIN_BIT_MASK;   // <-- bitmask: ทั้ง 2 ขาในคำสั่งเดียว
buttonIoConf.mode         = GPIO_MODE_INPUT;
buttonIoConf.pull_up_en   = GPIO_PULLUP_ENABLE;
buttonIoConf.pull_down_en = GPIO_PULLDOWN_DISABLE;
buttonIoConf.intr_type    = GPIO_INTR_NEGEDGE;     // FALLING edge = กดปุ่ม (active-low)
gpio_config(&buttonIoConf);

gpio_install_isr_service(0);                        // ติดตั้ง ISR service กลาง (ครั้งเดียว)
gpio_isr_handler_add((gpio_num_t)BUTTON_A_PIN, buttonA_isr, nullptr);
gpio_isr_handler_add((gpio_num_t)BUTTON_B_PIN, buttonB_isr, nullptr);
```

ปุ่มต่อแบบ pull-up ภายใน (ปกติ HIGH, กดแล้ว LOW) จึงใช้ `GPIO_INTR_NEGEDGE` (falling edge)
ตัว ISR (`buttonA_isr`/`buttonB_isr`, signature `void(*)(void*)` ตามที่ `gpio_isr_t` กำหนด, อยู่ใน
IRAM ผ่าน `IRAM_ATTR` เพราะแฟลชอาจถูกล็อกระหว่าง cache miss) เช็ค debounce ด้วย
`esp_timer_get_time()` (ไมโครวินาที) เทียบกับ timestamp ครั้งก่อน ถ้าห่างน้อยกว่า 250ms ถือว่าเป็น
contact bounce แล้วไม่ทำอะไรต่อ — ถ้าผ่าน debounce ก็ดันรหัสปุ่มเข้า `buttonEventQueue` แล้วจบ ไม่มี
งานหนักใน ISR เลย

### Watchdog Timer

```cpp
// รองรับทั้ง ESP32 Core 2.x และ Core 3.x (ESP-IDF v5 ใช้ esp_task_wdt_config_t)
initWatchdog(); // panic+reboot if a subscribed task goes silent
esp_task_wdt_add(sensorTaskHandle);
esp_task_wdt_add(networkTaskHandle);
esp_task_wdt_add(lcdTaskHandle);
esp_task_wdt_add(controlTaskHandle);
```

ทั้ง 4 tasks เรียก `esp_task_wdt_reset()` ทุกรอบ (ของตัวเอง) ถ้า task ไหนค้าง (เช่น I2C bus lock
เพราะสายหลุด, HTTPClient ค้างรอ response) เกิน 5 วินาทีโดยไม่ reset watchdog ชิปจะ panic แล้ว
รีบูตตัวเองอัตโนมัติ — พฤติกรรมนี้สำคัญสำหรับอุปกรณ์ที่ต้องทำงานต่อเนื่องในยิมโดยไม่มีคนคอยรีเซ็ตเอง

### Sleep Mode (Light Sleep)

**หลักการ:** เข้า sleep เฉพาะตอน idle จริงจัง (ไม่มีการกดปุ่มและไม่มีเซตค้างอยู่) นาน **5 นาทีขึ้นไป**
เท่านั้น — **ไม่ใช่ตอนพักระหว่างเซต** เพราะการอ่านชีพจร (HR) และ EMG ต้อง sample ต่อเนื่องตลอดช่วง
ออกกำลังกาย (ดู [`docs/sensor_usage.md`](sensor_usage.md) เรื่อง sensor fusion) เงื่อนไขนี้จึงจับได้แค่
กรณี "เปิดเครื่องทิ้งไว้เฉยๆ ระหว่างรอบการออกกำลังกาย" เท่านั้น

ก่อนหลับ:
1. ปิด I2C mutex-protected แสดงข้อความ "SLEEPING..." บนจอ
2. ตัด WiFi (`WiFi.disconnect(true)`)
3. ถอด 4 tasks ออกจาก watchdog แล้ว `esp_task_wdt_deinit()` — เหตุผล: ตัวจับเวลาของ watchdog เดิน
   ตามเวลาจริงต่อเนื่องแม้ระหว่างหลับ ถ้าปล่อยให้ subscribe อยู่ พอตื่นมาจะ panic ทันทีเพราะเวลาผ่านไป
   หลายนาทีโดยไม่มีใคร reset
4. ตั้ง wake source ตาม **bitmask** (ไม่ hardcode แต่ละ `esp_sleep_enable_*` ตรงๆ):

   ```cpp
   #define WAKE_SRC_TIMER (1 << 0) // periodic keepalive wake
   #define WAKE_SRC_EXT0  (1 << 1) // Button A wake
   const uint8_t SLEEP_WAKE_SOURCE_MASK = WAKE_SRC_TIMER | WAKE_SRC_EXT0;

   if (SLEEP_WAKE_SOURCE_MASK & WAKE_SRC_EXT0)  esp_sleep_enable_ext0_wakeup(BUTTON_A_PIN, 0); // กด = LOW
   if (SLEEP_WAKE_SOURCE_MASK & WAKE_SRC_TIMER) esp_sleep_enable_timer_wakeup(5 วินาที);       // keepalive
   ```

   ปิด/เปิด wake source ไหนก็แค่แก้บิตใน `SLEEP_WAKE_SOURCE_MASK` จุดเดียว ไม่ต้องไปลบ/เพิ่มโค้ด
   เรียก API ตรงจุดที่ใช้งานจริง

> ⚠️ **ข้อจำกัดฮาร์ดแวร์ที่ต้องรู้:** ชิป ESP32 รุ่นดั้งเดิม (ไม่ใช่ S2/S3/C3) รองรับ multi-GPIO wake
> (`ext1`) แค่โหมด "ทุกขาที่เลือกต้อง LOW พร้อมกัน" หรือ "ขาไหนก็ได้ต้อง HIGH" เท่านั้น — ไม่มีโหมด
> "ขาไหนก็ได้ที่ LOW" ซึ่งตรงกับปุ่มของเราที่เป็น active-low ทั้งคู่ ดังนั้นโค้ดนี้จึงใช้ `ext0` (รองรับขา
> เดียว, กำหนด level ได้อิสระ) กับ **ปุ่ม A (GPIO32) เท่านั้น** เป็นตัวปลุกจาก sleep ปุ่ม B ยังทำงานปกติ
> ตอนเครื่องตื่นอยู่ (ผ่าน interrupt เดิม) แต่จะปลุกเครื่องจาก sleep ไม่ได้ — การจำกัดนี้เป็นข้อจำกัดของ
> ชิป ไม่ใช่บั๊ก

ตื่นแล้ว: อ่าน `esp_sleep_get_wakeup_cause()` มา log, เปิด watchdog ใหม่ + subscribe ทั้ง 4 tasks,
เรียก `connectWiFi()` ใหม่

**ปิดได้ถ้าจำเป็น:** ตั้ง `#define ENABLE_LIGHT_SLEEP 0` ที่หัวไฟล์ ถ้าพบว่า light sleep ทำให้ WiFi
ไม่เสถียรตอนใช้งานจริงบนฮาร์ดแวร์ (จุดนี้ยัง**ไม่ได้ทดสอบบนบอร์ดจริง**ในรอบนี้ — ทดสอบ bench ก่อนใช้งาน
จริง โดยเฉพาะพฤติกรรม reconnect WiFi หลังตื่น)

### ผลการ build (ESP32)

```
RAM:   [=         ]  14.4% (used 47096 bytes from 327680 bytes)
Flash: [=======   ]  65.0% (used 852129 bytes from 1310720 bytes)
```

ตรวจสอบด้วย `pio run -d test-sensor -e esp32_wifi_buttons` — compile ผ่านสะอาด (มีแค่ warning เดิม
เรื่อง `I2C_BUFFER_LENGTH` ที่ชนกันระหว่างไลบรารี Wire กับ MAX3010x ซึ่งมีอยู่ก่อนแล้ว ไม่เกี่ยวกับการ
แก้ไขรอบนี้)

**ยังไม่ได้ทดสอบบนบอร์ดจริง** ในรอบนี้ (session นี้ไม่มีบอร์ดต่ออยู่) จุดที่ควรเน้นทดสอบก่อนใช้งานจริง:
1. Light sleep + WiFi reconnect หลังตื่น (ส่วนที่มีความเสี่ยงสูงสุด)
2. ค่า watchdog timeout 5 วินาทีเหมาะสมไหมกับ HTTP POST ที่อาจช้ากว่าปกติเมื่อ WiFi สัญญาณอ่อน
3. Debounce 250ms ของปุ่มใน ISR ยังกันการกดรัวได้เหมือนเดิมหรือไม่

## Arduino Uno: AVR-Native Sleep, Timer, Interrupt, Watchdog (no RTOS)

ไฟล์: [`test-sensor/src/uno_emg_fsr_link.cpp`](../test-sensor/src/uno_emg_fsr_link.cpp) (PlatformIO
build จริงผ่าน env `uno_emg_fsr_link`) และไฟล์คู่แฝด
[`test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino`](../test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino)

บอร์ดนี้คือ Arduino Uno (ATmega328P, 2KB RAM) ที่อ่าน sEMG (A0) + FSR (A1) แล้วส่งให้ ESP32 ผ่าน UART
— เดิมใช้ `analogRead()` แบบ blocking บวก `millis()` gate ทุก 10ms (ดู [`docs/sensor_usage.md`](sensor_usage.md)
และ [`PINS.md`](../PINS.md) สำหรับบทบาทของบอร์ดนี้ในระบบ) ชิประดับนี้ (2KB RAM) รัน FreeRTOS แบบ
ESP32 ไม่ได้จริงในทางปฏิบัติ จึงใช้ API ระดับ register ของ AVR เองแทน ครบทั้ง 4 กลไก (ไม่มี RTOS):

### ก่อน vs หลัง (Uno)

| | ก่อน (เดิม) | หลัง (ใหม่) |
|---|---|---|
| จังหวะ sample 100Hz | `millis() - lastSampleMs >= 10` ทุกรอบ | **Timer1** (CTC mode) ยิง `TIMER1_COMPA_vect` ทุก 10ms |
| อ่านค่า ADC | `analogRead()` แบบ blocking (~104us/ครั้ง ที่ CPU ตื่นรอเฉยๆ) | เริ่ม conversion แล้วปล่อยให้ **ADC interrupt** (`ADC_vect`) แจ้งเมื่อเสร็จ ไม่ block |
| การป้องกันค้าง | ไม่มี | **AVR Watchdog** (`<avr/wdt.h>`) รีเซตถ้าไม่ได้ `wdt_reset()` ภายใน 2 วิ |
| ตอนไม่มีอะไรทำ | วน loop() รอเฉยๆ (busy-loop, CPU ทำงานเต็มตลอด) | **`sleep_mode()`** (`SLEEP_MODE_IDLE`) พัก CPU ระหว่างรอ interrupt ถัดไป |

### Hardware Timer/Counter (Timer1, CTC mode)

```cpp
#define TIMER1_OCR1A_VALUE ((F_CPU / 64UL / SAMPLE_RATE_HZ) - 1) // 16MHz/64/100Hz - 1 = 2499

TCCR1B |= (1 << WGM12);              // CTC mode: reset ตัวนับเมื่อถึง OCR1A
TCCR1B |= (1 << CS11) | (1 << CS10); // prescaler = 64
OCR1A = TIMER1_OCR1A_VALUE;
TIMSK1 |= (1 << OCIE1A);             // เปิด interrupt เมื่อ compare match
```

`ISR(TIMER1_COMPA_vect)` ทำแค่ set บิต `FLAG_TIMER_TICK` ใน `eventFlags` (bitmask เดียวกับที่ใช้ฝั่ง
ESP32) — งานหนักทั้งหมดอยู่ใน `loop()` ที่ถูกปลุกจาก `sleep_mode()` เมื่อ flag นี้มา

### Interrupt (ADC แบบไม่ block)

`analogRead()` ปกติ busy-wait ~104us ต่อครั้งโดย CPU ตื่นเต็มตลอดช่วงนั้น โค้ดนี้เปลี่ยนมาเริ่ม
conversion แล้วให้ `ISR(ADC_vect)` แจ้งเมื่อเสร็จแทน:

```cpp
void startAdcConversion(uint8_t channel) {
  ADMUX = (ADMUX & 0xF0) | (channel & 0x0F);
  ADCSRA |= (1 << ADSC); // เริ่ม conversion
}

ISR(ADC_vect) {
  int value = ADC;
  if (currentAdcChannel == ADC_CHANNEL_EMG) {
    emgRawIsr = value;
    eventFlags |= FLAG_EMG_READY;
    startAdcConversion(ADC_CHANNEL_FSR); // ต่อด้วยช่อง FSR ทันที รอบเดียวกัน
  } else {
    fsrRawIsr = value;
    eventFlags |= FLAG_FSR_READY;
  }
}
```

ข้อดีนอกจากไม่ block CPU: ระหว่างรอ conversion (ผ่าน `sleep_mode()`) วงจรดิจิทัลอื่นๆ ในชิปเงียบลง
ทำให้สัญญาณรบกวนที่กวนค่า analog ที่วัดได้น้อยลงด้วย (เทคนิคมาตรฐานของ AVR สำหรับอ่านค่า analog
ที่แม่นยำขึ้น)

### Watchdog Timer

```cpp
MCUSR = 0;      // เคลียร์สาเหตุ reset ก่อนเสมอ กัน bootloader บางรุ่นที่ไม่เคลียร์ WDRF ให้ทำให้ reboot loop
wdt_disable();  // ปิดไว้ก่อนระหว่าง setup()
...
wdt_enable(WDTO_2S); // เปิดท้าย setup() -- ถ้า loop() ไม่เรียก wdt_reset() ภายใน 2 วิ จะ reset ชิปเอง
```

`wdt_reset()` ถูกเรียกครั้งเดียวต่อ 1 รอบการอ่านค่าที่สมบูรณ์ (emg+fsr เสร็จและส่งออก UART แล้ว) ใน
`loop()` — ถ้า ADC หรือ UART ค้างจนรอบไม่จบภายใน 2 วินาที ชิปจะรีเซตตัวเองอัตโนมัติ

### Sleep Mode

```cpp
set_sleep_mode(SLEEP_MODE_IDLE); // ตั้งครั้งเดียวใน setup()
...
sleep_mode(); // เรียกใน loop() ทุกครั้งที่ไม่มีอะไรต้องทำ -- พัก CPU จนกว่า interrupt ถัดไปจะมา
```

ใช้ `SLEEP_MODE_IDLE` (โหมดพักที่ตื้นที่สุด) เพราะยังต้องให้ Timer1 และ ADC ทำงาน/ปลุก CPU ได้ตามปกติ
— โหมดพักลึกกว่านี้ (เช่น `SLEEP_MODE_PWR_DOWN`) จะหยุด peripheral พวกนี้ไปด้วย ซึ่งจะทำให้ทั้งระบบ
หยุดทำงานไปเลย ไม่ใช่แค่ประหยัดไฟตอนไม่มีอะไรทำ

### ยังไม่ได้ compile-verify รอบนี้ — สำคัญ

ต่างจากฝั่ง ESP32 (ที่ compile ผ่าน `pio run -e esp32_wifi_buttons` สำเร็จ) **โค้ด Uno รอบนี้ไม่ได้
compile-verify** เพราะเครื่องที่ทำงานอยู่เป็น Apple Silicon (arm64) แต่ toolchain AVR
(`toolchain-atmelavr`) ที่ติดตั้งไว้เป็น x86_64 ล้วน และไม่มี Rosetta 2 ติดตั้งอยู่ (ผู้ใช้เลือกข้าม
การติดตั้ง Rosetta ในรอบนี้) โค้ดผ่านการรีวิวด้วยมืออย่างละเอียด (ชื่อ register/บิตทั้งหมดตรงกับ
datasheet ของ ATmega328P) แต่ **ยังไม่ผ่านการคอมไพล์จริงหรือทดสอบบนบอร์ดจริง** — แนะนำให้เปิดไฟล์นี้ใน
Arduino IDE หรือรัน `pio run -e uno_emg_fsr_link` บนเครื่องที่มี toolchain AVR ที่ใช้งานได้ เพื่อ
compile ให้แน่ใจก่อน flash ขึ้นบอร์ดจริง

## หมายเหตุ: การ sync `.cpp` กับ `.ino`

ทั้งสองบอร์ดมีไฟล์คู่แฝดที่ต้อง copy เนื้อหาให้ตรงกันเองแบบ manual (ไม่มี build script/symlink ผูกไว้):

- ESP32: `test-sensor/src/esp32_workout_firmware.cpp` (PlatformIO build จริง) ↔
  `test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino` (Arduino IDE)
- Uno: `test-sensor/src/uno_emg_fsr_link.cpp` (PlatformIO build จริง) ↔
  `test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino` (Arduino IDE)

ก่อนหน้าการแก้ไขรอบแรก คู่ ESP32 เคย drift ไม่ตรงกันมาแล้ว — การแก้ไขทุกรอบในเอกสารนี้ทำให้ทั้ง 2 คู่
เหมือนกันทุกตัวอักษรอีกครั้ง ถ้าแก้ไฟล์ใดไฟล์หนึ่งในอนาคต อย่าลืม copy ไปอีกไฟล์ในคู่เดียวกันด้วย
