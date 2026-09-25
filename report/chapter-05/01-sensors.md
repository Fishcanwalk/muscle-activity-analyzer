# 5.1 กล้องและเซนเซอร์ที่ใช้: ค่าที่อ่านโดยตรง ช่วงค่า และหน่วย

| อุปกรณ์ | วิธีรับข้อมูล | ค่าที่เกี่ยวข้อง | ช่วง/หน่วยตามโค้ด |
|---|---|---|---|
| sEMG | Uno ADC A0 | raw EMG | Uno 0-1023 แล้ว scale เป็น 0-4095 |
| FSR | Uno ADC A1 | raw/แรงกำและ stability | Uno 0-1023 กลับด้านและ scale เป็น 0-4095 |
| MPU6050/MPU6500 | ESP32 I2C address 0x68 | ax, ay, az, pitch, roll, velocity | accel ตั้งช่วง ±8g; velocity เป็นค่าคำนวณ |
| MAX30102 | ESP32 I2C address 0x57 | HR, SpO2 | HR เป็น BPM; SpO2 เป็นเปอร์เซ็นต์ประมาณการ |
| MLX90614 | ESP32 I2C address 0x5A | skin temperature, delta temperature | องศาเซลเซียส |
| กล้อง | browser video | elbow angle, torso angle, shoulder hike, motion | มุมเป็นองศา ระยะเป็นเซนติเมตร และ motion level 0-100 |

ขา I2C หลักของ ESP32 คือ SDA GPIO21 และ SCL GPIO22 ตาม `PINS.md` และ `board_config.h` ส่วน Uno ใช้ A0/A1 สำหรับสัญญาณอนาล็อก

แหล่งข้อมูล: `PINS.md`, `README.md`, `test-sensor/arduino/esp32_workout_firmware/`, `test-sensor/arduino/uno_emg_fsr_link/`, `frontend/src/lib/workout/`
