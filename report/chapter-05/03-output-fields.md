# 5.3 ฟิลด์ข้อมูลที่ส่งออกและข้อจำกัดของค่าประมาณ

telemetry หลักประกอบด้วยกลุ่ม `emg`, `fsr`, `mpu`, `vitals`, `device`, `timestamp` และอาจมี `buttons` โดย backend schema อนุญาตฟิลด์เพิ่มเติมเพื่อให้รองรับข้อมูลจากอุปกรณ์ได้ยืดหยุ่น

ตัวอย่างฟิลด์ที่เว็บใช้แสดงผล ได้แก่ `emg.raw`, `emg.rawBuffer`, `emg.rms`, `emg.peak`, `emg.mvcPercent`, `fsr.gripForce`, `fsr.gripStability`, `mpu.pitch`, `mpu.roll`, `mpu.velocity`, `vitals.hr`, `vitals.spo2`, `vitals.skinTemp` และสถานะอุปกรณ์

ข้อจำกัดสำคัญคือค่า EMG และแรง FSR อาศัย gain/full-scale ที่กำหนดในโค้ดและ calibration ของผู้ใช้ ขณะที่ SpO2 เป็น rough estimate ที่ source ระบุว่าไม่ใช่ค่าทางคลินิก และค่าจากกล้องขึ้นกับตำแหน่งกล้อง แสง และการมองเห็นร่างกาย

แหล่งข้อมูล: `backend/app/models/telemetry.py`, `frontend/src/lib/server/telemetryStore.ts`, `frontend/src/lib/workout/telemetry.svelte.ts`, `frontend/src/lib/workout/cameraRepCounter.svelte.ts`
