# 10.2 ข้อจำกัดของโครงงาน

1. ค่าที่แปลงจาก ADC เป็นหน่วย EMG และแรงเป็นค่าประมาณและขึ้นกับ gain/full-scale กับ calibration
2. SpO2 ใน firmware ระบุว่าเป็น rough estimate ไม่ใช่ค่าทางคลินิก
3. การนับครั้งจากกล้องขึ้นกับมุมกล้อง แสง และการมองเห็นแขน/ลำตัว
4. Recording slot ใน telemetry store เป็นทรัพยากรร่วมและรองรับการบันทึกจริงทีละรายการ
5. UART Uno ใช้ pin 0/1 จึงชนกับ USB serial และต้องถอดสายก่อน upload
6. `PINS.md` และบางส่วนของ `README.md` ยังมีข้อมูลเดิมที่ควรปรับให้ตรงกับโค้ดปัจจุบัน
7. รายงานแหล่งข้อมูลยังไม่มีผล validation เชิงตัวเลขสำหรับความแม่นยำของเซนเซอร์

แหล่งข้อมูล: `README.md`, `PINS.md`, `TROUBLESHOOTING.md`, `frontend/src/lib/server/telemetryStore.ts`, `frontend/src/lib/workout/cameraRepCounter.svelte.ts`
