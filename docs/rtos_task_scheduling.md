# RTOS จัดตารางงาน 4 Tasks บน ESP32 ยังไง

สรุปสั้นเฉพาะเรื่อง **การจัดตารางงาน (scheduling)** ของ FreeRTOS บน ESP32 ในเฟิร์มแวร์
[`esp32_workout_firmware.ino`](../test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino)
รายละเอียดเชิงลึกของแต่ละกลไก (sleep, watchdog, hardware timer) ดูที่
[`firmware_rtos_power.md`](firmware_rtos_power.md) ภาพรวมทั้งระบบดูที่ [`system_overview.md`](system_overview.md)

## การแบ่ง task เกิดขึ้นที่ไหน

**เฉพาะ ESP32** เท่านั้น เพราะมี 2 คอร์และรัน FreeRTOS อยู่แล้วใต้ Arduino core

- **Arduino Uno** ไม่มี RTOS (RAM 2 KB ไม่พอ) ใช้ `loop()` เดียวกับ Timer1 (CTC) แทน
- **ฝั่งเว็บ (SvelteKit/FastAPI)** เป็น event-driven/async ธรรมดา ไม่ได้แบ่งเป็น task แบบ RTOS

## 4 Tasks บน ESP32

สร้างด้วย `xTaskCreatePinnedToCore(...)` ใน `setup()`:

| Task | Priority | คอร์ | ถูกปลุกด้วย | หน้าที่ |
|---|---|---|---|---|
| `sensorTask` | 3 (สูงสุด) | 1 | semaphore จาก hardware timer ISR ทุก 10 ms | อ่าน UART จาก Uno (EMG/FSR), MPU-6050 (velocity), MAX30102 (HR/SpO2), MLX90614 (skin temp) |
| `networkTask` | 2 | 0 | `vTaskDelayUntil` ทุก 250 ms | ประกอบ JSON แล้ว POST ไป `/api/telemetry` |
| `controlTask` | 2 | 1 | คิวปุ่มกด (สูงสุด 100 ms) | อ่านปุ่ม A/B, สั่ง buzzer, จัดการ light sleep |
| `lcdTask` | 1 (ต่ำสุด) | 1 | `vTaskDelayUntil` ทุก 200 ms | วาดจอ LCD |

`networkTask` แยกไปอยู่คนละคอร์ (คอร์ 0) เพราะ `HTTPClient.POST()` บล็อกได้นาน 80-110 ms
ถ้าอยู่คอร์เดียวกับ `sensorTask` จะไปแย่งเวลาการ sample 100 Hz

## หลักการจัดตาราง

### 1. Priority
คอร์ 1 มี 3 task แชร์กัน (`sensorTask`, `controlTask`, `lcdTask`) — priority สูงกว่าได้รันก่อนเสมอ
เมื่อพร้อมพร้อมกัน `sensorTask` priority 3 จึงชนะทุก task บนคอร์เดียวกัน

### 2. Blocking แทนการวน polling
แต่ละ task ไม่วนลูปรัวๆ แต่ **block รอ** ให้ CPU ไปทำ task อื่นแทนตอนยังไม่ถึงเวลา:

- `sensorTask` → `xSemaphoreTake(sampleTickSemaphore, portMAX_DELAY)`
- `networkTask`, `lcdTask` → `vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(...))`
- `controlTask` → `xQueueReceive(buttonEventQueue, ..., pdMS_TO_TICKS(100))`

### 3. ป้องกันแย่งข้อมูลกัน (mutex)
เพราะ 3 task อยู่คอร์เดียวกันและเข้าถึงข้อมูลร่วม:

- `stateMutex` — ล็อกตอนอ่าน/เขียน `SharedState` (ค่าล่าสุดของทุกเซนเซอร์ + สถานะปุ่ม)
- `i2cMutex` — ล็อกตอนคุยกับ MPU/MAX30102/MLX90614 เพราะใช้บัส I2C เดียวกัน

### 4. Watchdog
ทุก task ต้องเรียก `esp_task_wdt_reset()` เป็นระยะ ถ้า task ไหนค้างเกิน `WATCHDOG_TIMEOUT_S`
(8 วินาที) บอร์ดจะ panic แล้วรีสตาร์ทตัวเองอัตโนมัติ

## สรุป

RTOS ไม่ได้ให้ 4 task รันพร้อมกันตลอดเวลา แต่จัดคิวตาม priority + เวลาที่แต่ละ task ขอตื่น
แล้ว context-switch เร็วมากจนดูเหมือนพร้อมกัน `sensorTask` ได้ priority สูงสุดเพราะต้องอ่านค่า
เซนเซอร์ให้ทันทุก 10 ms ส่วน `networkTask` ที่บล็อกนานสุด (รอ HTTP) ถูกแยกไปอยู่คนละคอร์เพื่อไม่ให้
กระทบการอ่านเซนเซอร์เลย
