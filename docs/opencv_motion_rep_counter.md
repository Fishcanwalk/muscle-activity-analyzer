# 🎥 OpenCV.js Motion-Based Rep Counter (Cross-Check)

หน้าเว็บ **Live Studio** (`PageLiveStudio.svelte`) มีการนับครั้ง (rep) จากกล้องอยู่แล้วผ่าน
**MediaPipe Pose** (elbow-angle finite-state machine ใน `telemetry.svelte.ts` ฟังก์ชัน
`updateFromMediaPipe()`) เอกสารนี้อธิบายฟีเจอร์ใหม่ที่เพิ่มเข้ามา: ตัวนับครั้ง **ที่สอง** ที่เป็นอิสระจาก
ตัวแรก ใช้ **OpenCV.js** (จับความเคลื่อนไหวแบบคลาสสิก ไม่ใช้โมเดล pose/ML) เป็น "ค่าตรวจสอบไขว้"
(cross-check) แสดงคู่กันบนหน้าจอ ไม่ใช่การมาแทนที่ตัวนับหลัก

## ทำไมถึงต้องมีตัวที่สอง

ผู้ใช้ระบุให้ใช้ **OpenCV** สำหรับกล้องบนหน้าเว็บโดยเฉพาะ ขณะที่ตัวนับหลักที่มีอยู่แล้วใช้ MediaPipe
(deep-learning pose model) ทั้งสองจับสัญญาณคนละแบบกัน — MediaPipe วิเคราะห์มุมข้อศอกจาก 33
landmark จุด, OpenCV แบบคลาสสิกจับ "พิกเซลที่เปลี่ยนไปจากเฟรมก่อนหน้า" ในบริเวณที่กำหนด (ROI) ล้วนๆ
ไม่มีความเข้าใจเรื่องข้อต่อ/ท่าทางเลย ข้อดีคือเบากว่ามาก (ไม่ต้องโหลดโมเดล pose ML) และเป็น "sanity
check" อิสระว่า MediaPipe จับสัญญาณแปลกๆ (เช่น light ไม่พอ, มุมกล้องแปลก) หรือไม่

## สถาปัตยกรรม

| ไฟล์ | หน้าที่ |
|---|---|
| [`frontend/src/lib/workout/cameraRepCounter.svelte.ts`](../frontend/src/lib/workout/cameraRepCounter.svelte.ts) | Rune class singleton (เหมือนแพทเทิร์นของ `WorkoutManager`/`TelemetryManager`) — โหลด OpenCV.js, ประมวลผลแต่ละเฟรม, รัน FSM นับครั้ง |
| [`frontend/src/lib/components/workout/CameraMotionPanel.svelte`](../frontend/src/lib/components/workout/CameraMotionPanel.svelte) | การ์ดแสดงผล (ไม่มี props, import singleton ตรงๆ ตามแพทเทิร์นของ `BiofeedbackSensors.svelte`) |
| [`frontend/src/lib/components/workout/PageLiveStudio.svelte`](../frontend/src/lib/components/workout/PageLiveStudio.svelte) | จุดเชื่อม: เรียก `cameraRepCounter.start()`/`stop()` คู่กับ `startWebcam()`/`stopWebcam()` เดิม และเรียก `cameraRepCounter.processFrame(videoElement)` ในทุก `onFrame` callback เดียวกับที่ส่งภาพให้ MediaPipe |

**ใช้กล้อง/สตรีมเดียวกัน** — ไม่มีการเรียก `getUserMedia` ซ้ำสอง ตัวนับ OpenCV เกาะไปกับ
`Camera`/`onFrame` callback ของ MediaPipe ที่มีอยู่แล้ว เฟรมเดียวกันถูกส่งให้ทั้งสองตัวประมวลผลต่อกัน

**ไม่เรียก `workout.recordRep()`** — ตัวนับนี้เป็นการแสดงผลอย่างเดียว (read-only) เพื่อไม่ให้ไปนับซ้ำ
ซ้อนกับสถิติ/คะแนนจริงที่ MediaPipe เป็นคนบันทึกอยู่แล้ว (`repsInSet`, `totalReps`, ฯลฯ ใน
`workout.svelte.ts`)

## การโหลด OpenCV.js

ใช้แพทเทิร์นเดียวกับ `ensureMediaPipeScripts()` ที่มีอยู่แล้วใน `PageLiveStudio.svelte` (แทรก
`<script>` เข้า `document.head` แล้ว poll จนกว่าจะพร้อม) ต่างกันตรงที่ OpenCV.js คอมไพล์ WASM
module แบบ async เบื้องหลัง — แค่ script `onload` ไม่พอ (แปลว่าโหลดไฟล์เสร็จ แต่ WASM ยังไม่พร้อมใช้)
ต้องรอ callback `cv['onRuntimeInitialized']` อีกชั้นหนึ่งก่อนเรียกใช้ `cv.Mat`/`cv.imread` ฯลฯ ได้จริง

## อัลกอริทึม (frame differencing)

ทำงานทุกเฟรมใน `processFrame(videoEl)`:

1. วาดเฟรมปัจจุบันลง canvas ที่ลดขนาดเหลือ 160×120 (เร็วกว่ามาก ไม่ต้องประมวลผลที่ความละเอียดเต็ม)
2. แปลงเป็น grayscale (`cv.cvtColor(..., cv.COLOR_RGBA2GRAY)`) แล้ว blur เบาๆ
   (`cv.GaussianBlur`) ลด noise จาก sensor กล้อง
3. หาผลต่างสัมบูรณ์กับเฟรมก่อนหน้า (`cv.absdiff`) แล้ว threshold ให้เหลือ 0/255
   (`cv.threshold`) — ตำแหน่งที่ต่างกันเกิน 25 ระดับความสว่างถือว่า "มีการเคลื่อนไหว"
4. นับพิกเซลที่เปลี่ยนภายในกรอบ ROI (แถบแนวนอนกลางภาพ ที่ประมาณตำแหน่งแขน/ดัมเบลเคลื่อนที่)
   ด้วย `cv.countNonZero` ได้เป็นสัดส่วน % ของพื้นที่ ROI ที่ "เคลื่อนไหว" ต่อเฟรม
5. Smooth ค่านั้นด้วย exponential moving average แล้ว normalize แบบ adaptive
   (เทียบกับ running max ที่ decay ช้าๆ) ให้ได้ `motionLevel` 0-100 ที่ไม่ขึ้นกับระยะห่างกล้อง/แสง
6. State machine `REST → RISING → FALLING → REST` (เพิ่ม `repCount` ตอนกลับมา `REST` หลังเคย
   ขึ้นถึง peak) — เลียนแบบสไตล์เดียวกับ elbow-angle FSM ใน `telemetry.svelte.ts` ทุกประการ
   ต่างแค่สัญญาณที่ป้อนเข้า (motion pixel แทนมุมข้อศอก)

## ข้อควรระวัง: WASM memory cleanup

OpenCV.js จองหน่วยความจำใน WASM heap ไม่ใช่ JS heap ปกติ — Garbage Collector ของ JavaScript
**ไม่รู้จัก** `cv.Mat` object พวกนี้เลย ทุก Mat ที่สร้างขึ้นในแต่ละเฟรม (`src`, `gray`, `blurred`,
`diff`, `thresh`, `roiMat`) ต้องเรียก `.delete()` เองทุกครั้งใน `finally` block ไม่งั้นหน่วยความจำจะ
รั่วไหลสะสมจนแท็บเบราว์เซอร์ค้าง/แครช ภายในไม่กี่นาทีที่กล้องเปิดค้างไว้ (100Hz เฟรม MediaPipe ก็ราวๆ
30 FPS จริง แปลว่า 30 ชุด Mat ที่ต้อง delete ทุกวินาที)

## บทบาท: เป็นค่าอ้างอิง ไม่ใช่คะแนนจริง

`CameraMotionPanel.svelte` แสดงชัดเจนว่าตัวเลขนี้เป็น "cross-check" ไม่ถูกส่งเข้า
`workout.recordRep()` และไม่กระทบสถิติ/ผลสรุปเซตใดๆ ทั้งสิ้น — เหมาะสำหรับดูเปรียบเทียบคร่าวๆ ว่า
MediaPipe กับสัญญาณการเคลื่อนไหวดิบสอดคล้องกันหรือไม่ (เช่น ถ้าตัวเลขห่างกันมาก อาจแปลว่าแสง/มุมกล้อง
มีปัญหา หรือ MediaPipe จับ landmark พลาด)

## การตรวจสอบ

- `pnpm check` (svelte-check + TypeScript): ผ่าน 0 errors หลังเพิ่มไฟล์นี้ (มี warning เดิม 2 จุดใน
  `login-form.svelte`/`register-form.svelte` ที่ไม่เกี่ยวข้องกับการแก้ไขรอบนี้)
- `npx @sveltejs/mcp svelte-autofixer` รันผ่านทั้ง `CameraMotionPanel.svelte` (ไม่มี issue) และ
  `PageLiveStudio.svelte` (พบ issue เดิม 3 จุดเรื่อง `{#each}` ไม่มี key ที่มีอยู่ก่อนแล้วในไฟล์ ไม่เกี่ยวกับ
  โค้ดที่เพิ่มเข้ามารอบนี้ — ไม่ได้แก้เพราะอยู่นอกขอบเขตงานนี้)
- **ยังไม่ได้ทดสอบกับกล้องเว็บแคมจริงใน session นี้** (ไม่มีเบราว์เซอร์ที่เข้าถึงกล้องได้ในสภาพแวดล้อมนี้)
  — แนะนำให้เปิด dev server (`pnpm dev`) แล้วเข้าไปที่หน้า Live Studio, กด "เปิดกล้องจริง" แล้วลองขยับ
  มือ/แขนหน้ากล้องเพื่อดูว่าค่า Motion Level ขยับตามจริงและ Motion-Based Reps นับสอดคล้องกับตัวนับ
  MediaPipe หลักหรือไม่ ก่อนถือว่าฟีเจอร์นี้ใช้งานได้สมบูรณ์
