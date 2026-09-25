# 5.2 อัตราการอ่าน การปรับเทียบ และค่าที่คำนวณต่อ

Uno ทำรอบอ่านที่ 100 Hz หรือทุก 10 ms โดย Timer1 CTC เริ่ม ADC EMG แล้ว ADC interrupt เริ่มอ่าน FSR ต่อกัน ส่วน ESP32 ใช้ hardware timer ปลุก `SensorTask` ทุก 10 ms เช่นกัน แต่ส่งข้อมูลเครือข่ายทุก 250 ms หรือประมาณ 4 Hz จออัปเดตทุก 200 ms และ MLX90614 อ่านทุก 250 ms

การปรับเทียบของเว็บเก็บ `emgBaseline`, `emgMvc`, `fsrZero` และ `fsrMax` ต่อผู้ใช้ ค่า EMG ถูกแปลงจาก ADC โดย recenter รอบค่ากลางและหารด้วย gain ที่กำหนดใน telemetry store ส่วน FSR ถูก normalize ระหว่าง zero กับ max แล้วแปลงเป็นแรงเต็มสเกลที่กำหนดไว้ในโค้ด

ค่าที่คำนวณต่อ ได้แก่ MVC percent, high-tension flag, FSR stability จากช่วงค่าหน้าต่าง, pitch/roll, velocity, HR, SpO2 จากอัตราส่วน AC/DC และ delta temperature

แหล่งข้อมูล: `test-sensor/arduino/uno_emg_fsr_link/uno_emg_fsr_link.ino`, `test-sensor/arduino/esp32_workout_firmware/esp32_workout_firmware.ino`, `frontend/src/lib/server/telemetryStore.ts`, `frontend/src/lib/workout/calibration.svelte.ts`
