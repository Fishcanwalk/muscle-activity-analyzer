# 3.3 การออกแบบขั้นตอนประมวลผล

การประมวลผลถูกแบ่งตามความเร่งด่วนของงาน

- งานอ่านสัญญาณของ Uno อยู่ใน interrupt และ loop ที่หลับรอเหตุการณ์ เพื่อลดการ polling
- งานอ่านและรวมเซนเซอร์ของ ESP32 อยู่ใน `SensorTask` ที่ถูกปลุกด้วย hardware timer 100 Hz
- งานเครือข่ายอยู่ใน `NetworkTask` ทุก 250 ms จึงไม่ทำให้รอบอ่านเซนเซอร์ต้องรอ HTTP
- งานจอและการควบคุมปุ่มแยกเป็น `LcdTask` และ `ControlTask`
- ข้อมูลที่แชร์ระหว่าง task ใช้ mutex, queue และ semaphore ตามลักษณะข้อมูล
- เว็บแปลงค่าและคำนวณค่าที่ใช้แสดงผลก่อน broadcast ให้ browser

การออกแบบนี้ช่วยให้ส่วนที่ต้องสม่ำเสมอ เช่น ADC และ timer ไม่ถูกผูกกับความเร็วของเครือข่าย

แหล่งข้อมูล: โค้ดใน `test-sensor/arduino/uno_emg_fsr_link/` และ `test-sensor/arduino/esp32_workout_firmware/`, `frontend/src/lib/server/telemetryStore.ts`
