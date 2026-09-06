#!/usr/bin/env python3
"""จำลองพฤติกรรม ESP32 firmware สำหรับทดสอบ Live Session flow โดยไม่ต้องมีฮาร์ดแวร์จริง

ตัว ESP32 จริงไม่รู้จักแนวคิด "session" -- มันแค่สตรีม telemetry ต่อเนื่องไปตาม device_id
ส่วนการ start/stop session เป็นหน้าที่ของฝั่งเว็บ (คนกดปุ่มใน LiveSessionPanel) สคริปต์นี้จึง
ทำหน้าที่แค่ยิง POST /api/telemetry ตาม device_id ที่กำหนด ไม่เรียก /api/sessions/* เอง

ใช้ urllib ในตัว Python เท่านั้น (ไม่เพิ่ม dependency ให้ requirements.txt)

ตัวอย่าง: เปิดหน้าเว็บ กด "เริ่ม Live Session" ด้วย Device ID เช่น SIM_USER_001 ก่อน แล้วค่อยรัน
    python backend/scripts/simulate_esp32.py --device-id SIM_USER_001 --duration 20
"""

import argparse
import json
import random
import time
import urllib.request


def call_api(api_base: str, method: str, path: str, body: dict) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{api_base}{path}", data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def main():
    parser = argparse.ArgumentParser(description="จำลอง ESP32 สตรีม telemetry แบบ real-time ไปตาม device_id")
    parser.add_argument("--api", default="http://localhost:5001", help="Backend base URL")
    parser.add_argument("--device-id", required=True, help="ต้องตรงกับ Device ID ที่ตั้งไว้ตอนกด 'เริ่ม Live Session' บนเว็บ")
    parser.add_argument("--duration", type=float, default=20, help="ระยะเวลาจำลอง (วินาที)")
    parser.add_argument("--interval-ms", type=int, default=300)
    args = parser.parse_args()

    print(f"[sim] streaming telemetry to device_id={args.device_id} for {args.duration}s ...")

    base_emg = random.uniform(150, 180)
    base_force = random.uniform(30, 45)
    ticks = int(args.duration * 1000 / args.interval_ms)

    for i in range(ticks):
        progress = i / max(ticks, 1)
        noise = random.uniform(-8, 8)

        emg_samples = [max(0, int(base_emg + progress * 40 + random.uniform(-20, 20))) for _ in range(10)]
        emg_rms = sum(x * x for x in emg_samples) ** 0.5 / len(emg_samples) ** 0.5
        emg_mav = sum(emg_samples) / len(emg_samples)
        fsr_raw = int((base_force + progress * 15 + noise) * 15)
        fsr_force = round((base_force + progress * 15 + noise), 1)

        payload = {
            "device_id": args.device_id,
            "timestamp_ms": int(time.time() * 1000),
            "emg_samples": emg_samples,
            "emg_rms": round(emg_rms, 1),
            "emg_mav": round(emg_mav, 1),
            "fsr_raw": fsr_raw,
            "fsr_force": fsr_force,
            "accel": [round(random.uniform(-1, 1), 2) for _ in range(3)],
            "gyro": [round(random.uniform(-2, 2), 2) for _ in range(3)],
            "pitch": round(random.uniform(30, 60), 1),
            "roll": round(random.uniform(100, 150), 1),
            "heart_rate": round(random.uniform(75, 100)),
            "spo2": round(random.uniform(96, 99), 1),
            "skin_temp": round(random.uniform(33, 35), 1),
            "ambient_temp": round(random.uniform(25, 28), 1),
        }
        call_api(args.api, "POST", "/api/telemetry", payload)
        if i % 5 == 0:
            print(f"[sim] tick {i}/{ticks}  emg_rms={payload['emg_rms']}  fsr_force={payload['fsr_force']}")
        time.sleep(args.interval_ms / 1000)

    print("[sim] done streaming. Stop the session from the web UI to save it as a log.")


if __name__ == "__main__":
    main()
