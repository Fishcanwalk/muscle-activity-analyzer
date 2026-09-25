# 2.2 ข้อมูลที่ระบบรับเข้า ประมวลผล และแสดงผล

## ข้อมูลรับเข้า

- Uno ส่งค่า `emg,fsr` เป็นข้อความทาง UART
- ESP32 รับค่าจาก Uno และอ่าน MPU, MAX30102, MLX90614 ผ่าน I2C
- ESP32 ส่ง JSON telemetry ที่มี `emg`, `fsr`, `mpu`, `vitals`, `device`, `timestamp` และสถานะปุ่ม
- เว็บรับข้อมูล JSON จากอุปกรณ์ และรับคำสั่งจากผู้ใช้ เช่น เริ่ม/หยุดบันทึกและบันทึก calibration

## ข้อมูลประมวลผล

ESP32 คำนวณ pitch, roll, velocity, ความนิ่งของ FSR, HR และ SpO2 ประมาณการ ส่วน frontend แปลง ADC เป็นหน่วยที่ใช้แสดงผล คำนวณ MVC percent และสถานะ high tension รวมทั้งใช้ MediaPipe/OpenCV ช่วยวิเคราะห์การเคลื่อนไหว

## ข้อมูลแสดงผลและบันทึก

แดชบอร์ดแสดงกราฟ EMG ค่าแรงและความนิ่งของ FSR การเคลื่อนไหว สัญญาณชีพ สถานะอุปกรณ์ จำนวนครั้ง และผลรายเซต ข้อมูลผลเซตและ calibration ส่งต่อ FastAPI เพื่อจัดเก็บใน MongoDB

แหล่งข้อมูล: `backend/app/models/telemetry.py`, `frontend/src/lib/server/telemetryStore.ts`, `frontend/src/lib/workout/telemetry.svelte.ts`, `README.md`
