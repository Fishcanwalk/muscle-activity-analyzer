# 3.2 ลำดับขั้นตอนและการไหลของข้อมูล

ลำดับการทำงานโดยย่อมีดังนี้

1. sEMG และ FSR ต่อเข้ากับ A0/A1 ของ Uno
2. Uno ใช้ Timer1 เริ่มรอบอ่านทุก 10 ms แล้วใช้ ADC interrupt อ่าน EMG ต่อด้วย FSR
3. Uno กลับค่า FSR, scale ค่าจาก 10-bit เป็น 12-bit และส่ง `emg,fsr` ผ่าน UART 9600
4. ESP32 อ่านข้อมูลจาก `Serial2` พร้อมอ่าน MPU, MAX30102, MLX90614 ผ่าน I2C
5. NetworkTask รวมข้อมูลเป็น JSON และ POST ไปยัง `/api/telemetry` ของ frontend
6. frontend อัปเดตสถานะในหน่วยความจำ กระจาย event `telemetry` ผ่าน `/api/telemetry/stream` และส่งข้อมูลต่อไป FastAPI
7. FastAPI ตรวจสอบ service token และบันทึกลง collection `telemetry_samples`

ให้ใช้ [`../flowchart.md`](../flowchart.md) Flowchart 1 เป็นรูปประกอบหัวข้อนี้

แหล่งข้อมูล: `README.md`, `test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino`, `test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino`, `frontend/src/routes/api/`, `backend/app/routers/telemetry.py`
