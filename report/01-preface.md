# คำนำ

รายงานฉบับนี้จัดทำขึ้นเพื่ออธิบายการพัฒนาระบบ `muscle-activity-analyzer` ตั้งแต่การรับค่าจากเซนเซอร์ การประมวลผลบน Arduino Uno และ ESP32 การส่งข้อมูลผ่านเว็บ ไปจนถึงการจัดเก็บและแสดงผลบนแดชบอร์ด

เนื้อหาแบ่งตามโครงสร้างใน `report/structure.md` และแยกแต่ละข้อเป็นไฟล์ Markdown เพื่อให้ผู้พัฒนาสามารถแก้ไขเฉพาะส่วนได้ง่าย ส่วนที่ระบุว่าเป็น flowchart จะอ้างอิงไปยัง `report/flowchart.md` ซึ่งเขียนด้วย Mermaid สำหรับนำไปสร้างภาพภายหลัง

แหล่งข้อมูลของรายงานจำกัดอยู่ที่โค้ดในโฟลเดอร์เฟิร์มแวร์ `test-sensor/arduino/esp32_workout_firmware/`, `test-sensor/arduino/uno_emg_fsr_link/`, โค้ด `backend/`, `frontend/` และเอกสาร `PINS.md`, `README.md`, `TROUBLESHOOTING.md`
