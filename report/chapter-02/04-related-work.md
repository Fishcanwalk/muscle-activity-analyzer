# 2.4 แนวคิด เครื่องมือ หรืองานที่เกี่ยวข้อง

แนวคิดสำคัญที่ใช้ในระบบคือการแบ่งงานตามความเหมาะสมของอุปกรณ์ ได้แก่ interrupt และ timer สำหรับงานที่ต้องตรงเวลา, FreeRTOS task สำหรับแยกงานบน ESP32, UART สำหรับลิงก์ระหว่างบอร์ด, I2C สำหรับเซนเซอร์หลายตัวบนบัสร่วม และ HTTP/SSE สำหรับส่งข้อมูลระหว่างอุปกรณ์กับเว็บ

เครื่องมือและเทคโนโลยีที่ปรากฏในแหล่งข้อมูล ได้แก่ Arduino framework, FastAPI, SvelteKit, TypeScript, MongoDB, Docker และไลบรารีของเซนเซอร์ เช่น `Adafruit_MLX90614`, MAX30105/heart-rate และ `LiquidCrystal_I2C`

ส่วนการวิเคราะห์กล้องใช้ MediaPipe ในตัวนับหลัก และมี OpenCV.js เป็นตัวนับตรวจสอบแบบ motion difference แยกต่างหาก โดยตัวนับ OpenCV ไม่เรียกบันทึก rep หลักซ้ำ

แหล่งข้อมูล: `README.md`, `backend/pyproject.toml`, `frontend/package.json`, `frontend/src/lib/workout/`, โค้ด Arduino ทั้งสองโฟลเดอร์
