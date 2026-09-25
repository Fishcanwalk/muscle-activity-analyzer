# ภาคผนวก

## ภาคผนวก ก: จุดอ้างอิง flowchart

ไฟล์ [`flowchart.md`](flowchart.md) มี Mermaid 3 ชุดสำหรับใช้สร้างภาพประกอบ

- Flowchart 1: การไหลของข้อมูลจาก Uno ถึง MongoDB — ใช้ในข้อ 3.2 และ 7.5
- Flowchart 2: Timer1, ADC interrupt และ UART ของ Uno — ใช้ในข้อ 7.2
- Flowchart 3: Task, timer, interrupt, I2C และ HTTP ของ ESP32 — ใช้ในข้อ 7.3

## ภาคผนวก ข: ข้อควรระวังในการต่ออุปกรณ์

- Uno ส่งสัญญาณ 5V ไปยัง ESP32 ซึ่งเป็น logic 3.3V ต้องใช้ voltage divider ตามที่ระบุใน `PINS.md`
- UART ปัจจุบันของ Uno ใช้ pin 0/1 จึงควรถอดสายออกก่อน upload และไม่ควรใช้ USB serial monitor พร้อมกัน
- I2C ของ ESP32 ใช้ SDA GPIO21 และ SCL GPIO22 ตาม mapping ใน firmware
- ปุ่ม ESP32 ใช้ GPIO32/GPIO33 และปุ่มทำงานแบบ active-low ตามรายละเอียดใน `PINS.md`

## ภาคผนวก ค: รูปแบบ telemetry โดยย่อ

```json
{
  "timestamp": 0,
  "emg": {"raw": 0, "rms": 0, "mvcPercent": 0},
  "fsr": {"force": 0, "stability": 0},
  "mpu": {"pitch": 0, "roll": 0, "velocity": 0},
  "vitals": {"hr": 0, "spo2": 0, "skinTemp": 0},
  "buttons": {"a": false, "b": false}
}
```

ตัวอย่างนี้เป็นโครงร่างเพื่ออธิบายกลุ่มข้อมูล ไม่ใช่การระบุว่าทุก field จะมีค่าในทุก packet
