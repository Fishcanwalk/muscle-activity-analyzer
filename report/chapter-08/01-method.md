# 8.1 วัตถุประสงค์ วิธีการ และสภาพแวดล้อมการทดสอบ

การทดสอบมุ่งตรวจสอบ 4 เรื่อง คือ การอ่านค่าเซนเซอร์ การสื่อสารระหว่าง Uno กับ ESP32 การส่งข้อมูลเข้าสู่เว็บ/API และการแสดงผลหรือบันทึกข้อมูลตามเซสชัน

สภาพแวดล้อมที่ระบุในเอกสารโครงการประกอบด้วย Arduino Uno, ESP32 DevKit, เซนเซอร์ที่ต่อผ่าน ADC/UART/I2C, MongoDB ผ่าน Docker, FastAPI backend และ SvelteKit frontend การทดสอบการสื่อสารใช้ Serial monitor, I2C scanner และ diagnostic raw echo ตามบันทึก troubleshooting

วิธีทดสอบควรเริ่มจากแยกส่วน: ตรวจ Uno ส่งข้อความได้ก่อน จากนั้นตรวจ ESP32 รับ UART และอ่าน I2C ต่อด้วยตรวจ POST เข้า frontend, SSE ไป browser และการบันทึกเข้า backend เพื่อให้แยกสาเหตุได้เมื่อเกิดข้อผิดพลาด

แหล่งข้อมูล: `README.md`, `PINS.md`, `TROUBLESHOOTING.md`, โค้ดในสองโฟลเดอร์ Arduino และ `backend/`, `frontend/`
