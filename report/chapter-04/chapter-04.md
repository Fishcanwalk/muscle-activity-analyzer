# บทที่ 4 ข้อมูลจากเซนเซอร์

## 4.1 กล้องและเซนเซอร์ที่ใช้: ค่าที่อ่านโดยตรง ช่วงค่า และหน่วย

| อุปกรณ์ | วิธีรับข้อมูล | ค่าที่เกี่ยวข้อง | ช่วง/หน่วยตามโค้ด |
|---|---|---|---|
| sEMG | Uno ADC A0 | raw EMG | Uno 0-1023 แล้ว scale เป็น 0-4095 |
| FSR | Uno ADC A1 | raw/แรงกำและ stability | Uno 0-1023 กลับด้านและ scale เป็น 0-4095 |
| MPU6050/MPU6500 | ESP32 I2C address 0x68 | ax, ay, az, pitch, roll, velocity | accel ตั้งช่วง ±8g; velocity เป็นค่าคำนวณ |
| MAX30102 | ESP32 I2C address 0x57 | HR, SpO2 | HR เป็น BPM; SpO2 เป็นเปอร์เซ็นต์ประมาณการ |
| MLX90614 | ESP32 I2C address 0x5A | skin temperature, delta temperature | องศาเซลเซียส |
| กล้อง | browser video | elbow angle, torso angle, shoulder hike, motion | มุมเป็นองศา ระยะเป็นเซนติเมตร และ motion level 0-100 |

ขา I2C หลักของ ESP32 คือ SDA GPIO21 และ SCL GPIO22 ตาม `PINS.md` และ `board_config.h` ส่วน Uno ใช้ A0/A1 สำหรับสัญญาณอนาล็อก

## 4.2 อัตราการอ่าน การปรับเทียบ และค่าที่คำนวณต่อ

อัตราการอ่านของแต่ละอุปกรณ์ต่างกันตามความจำเป็น: สัญญาณ sEMG และ FSR ต้องอ่านถี่และสม่ำเสมอที่สุด รองลงมาคือเซนเซอร์ I2C บน ESP32 ส่วนการส่งข้อมูลเข้าเว็บและการอัปเดตจอทำงานช้ากว่าและไม่ผูกกับรอบอ่านเซนเซอร์โดยตรง รายละเอียดการตั้ง Timer1 ของ Uno และการแบ่ง task ตามรอบเวลาของ ESP32 อยู่ในหัวข้อ 6.2 และ 6.3

การปรับเทียบของเว็บเก็บ `emgBaseline`, `emgMvc`, `fsrZero` และ `fsrMax` ต่อผู้ใช้ ค่า EMG ถูกแปลงจาก ADC โดย recenter รอบค่ากลางและหารด้วย gain ที่กำหนดใน telemetry store ส่วน FSR ถูก normalize ระหว่าง zero กับ max แล้วแปลงเป็นแรงเต็มสเกลที่กำหนดไว้ในโค้ด

ค่าที่คำนวณต่อ ได้แก่ MVC percent, high-tension flag, FSR stability จากช่วงค่าหน้าต่าง, pitch/roll, velocity, HR, SpO2 จากอัตราส่วน AC/DC และ delta temperature

## 4.3 ฟิลด์ข้อมูลที่ส่งออกและข้อจำกัดของค่าประมาณ

telemetry หลักประกอบด้วยกลุ่ม `emg`, `fsr`, `mpu`, `vitals`, `device`, `timestamp` และอาจมี `buttons` โดย backend schema อนุญาตฟิลด์เพิ่มเติมเพื่อให้รองรับข้อมูลจากอุปกรณ์ได้ยืดหยุ่น

ตัวอย่างฟิลด์ที่เว็บใช้แสดงผล ได้แก่ `emg.raw`, `emg.rawBuffer`, `emg.rms`, `emg.peak`, `emg.mvcPercent`, `fsr.gripForce`, `fsr.gripStability`, `mpu.pitch`, `mpu.roll`, `mpu.velocity`, `vitals.hr`, `vitals.spo2`, `vitals.skinTemp` และสถานะอุปกรณ์

ข้อจำกัดสำคัญคือค่า EMG และแรง FSR อาศัย gain/full-scale ที่กำหนดในโค้ดและ calibration ของผู้ใช้ ขณะที่ SpO2 เป็น rough estimate ที่ source ระบุว่าไม่ใช่ค่าทางคลินิก และค่าจากกล้องขึ้นกับตำแหน่งกล้อง แสง และการมองเห็นร่างกาย

แหล่งข้อมูล: `PINS.md`, `README.md`, `test-sensor/arduino/esp32_workout_firmware/`, `test-sensor/arduino/uno_emg_fsr_link/`, `frontend/src/lib/workout/`, `frontend/src/lib/server/telemetryStore.ts`, `frontend/src/lib/workout/calibration.svelte.ts`, `backend/app/models/telemetry.py`, `frontend/src/lib/workout/telemetry.svelte.ts`, `frontend/src/lib/workout/cameraRepCounter.svelte.ts`
