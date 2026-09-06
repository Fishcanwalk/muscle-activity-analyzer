"""สร้างข้อมูลผู้ป่วย + ประวัติ session ตัวอย่าง สำหรับ demo หน้า Comparison โดยไม่ต้องรอ ESP32 จริง

รัน: python -m app.seed.seed_mock_data
"""

import random
from datetime import datetime, timedelta, timezone

from app.extensions import get_db

MOCK_PATIENTS = [
    {
        "patient_id": "USER_001",
        "name": "สมชาย ใจดี",
        "age": 45,
        "target_muscle": "Biceps Brachii",
        "note": "กล้ามเนื้ออ่อนแรงหลังผ่าตัด เริ่มโปรแกรมฟื้นฟู 5 สัปดาห์ก่อน",
    },
    {
        "patient_id": "USER_002",
        "name": "สมหญิง แข็งแรง",
        "age": 58,
        "target_muscle": "Quadriceps",
        "note": "กล้ามเนื้อขาอ่อนแรงจากโรคหลอดเลือดสมอง",
    },
]


def _generate_sessions(patient_id: str, target_muscle: str, count: int = 5) -> list[dict]:
    now = datetime.now(timezone.utc)
    sessions = []

    base_force = random.uniform(30, 40)
    base_emg = random.uniform(150, 180)
    base_duration = random.uniform(60, 90)

    for i in range(count):
        week_offset = count - i
        started_at = now - timedelta(weeks=week_offset)
        ended_at = started_at + timedelta(minutes=5)

        # แนวโน้มดีขึ้นทีละน้อยแบบสมจริง (มี noise ไม่ใช่เส้นตรง)
        progress = (count - week_offset) * random.uniform(1.5, 3.0)
        noise = random.uniform(-2, 2)

        summary_metrics = {
            "duration_seconds": round(base_duration + progress * 2 + noise, 1),
            "max_emg_rms": round(base_emg + progress * 4 + noise * 2, 1),
            "avg_emg_rms": round((base_emg + progress * 4 + noise * 2) * 0.85, 1),
            "max_force_newton": round(base_force + progress + noise * 0.5, 1),
            "avg_heart_rate": round(random.uniform(75, 95), 0),
            "avg_spo2": round(random.uniform(96, 99), 1),
            "max_skin_temp_c": round(random.uniform(33, 35), 1),
        }

        sessions.append(
            {
                "session_name": f"{target_muscle} Training Session #{i + 1}",
                "subject_id": patient_id,
                "target_muscle": target_muscle,
                "started_at": started_at,
                "ended_at": ended_at,
                "status": "completed",
                "device_id": "MOCK_SEED",
                "summary_metrics": summary_metrics,
                "created_at": started_at,
            }
        )

    return sessions


def run():
    db = get_db()

    for patient in MOCK_PATIENTS:
        existing = db.patients.find_one({"patient_id": patient["patient_id"]})
        if existing:
            print(f"[seed] patient {patient['patient_id']} already exists, skip")
            continue

        doc = dict(patient)
        doc["created_at"] = datetime.now(timezone.utc)
        db.patients.insert_one(doc)
        print(f"[seed] created patient {patient['patient_id']}")

        sessions = _generate_sessions(patient["patient_id"], patient["target_muscle"])
        db.sessions.insert_many(sessions)
        print(f"[seed] created {len(sessions)} sessions for {patient['patient_id']}")

    print("[seed] done")


if __name__ == "__main__":
    run()
