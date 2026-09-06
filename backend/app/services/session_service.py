from datetime import datetime, timezone

from bson import ObjectId

from app.extensions import get_db
from app.models.session_model import SessionManualCreate, SessionStart


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["session_id"] = str(doc.pop("_id"))
    return doc


def start_session(data: SessionStart) -> dict:
    db = get_db()
    doc = {
        "session_name": data.session_name,
        "subject_id": data.subject_id,
        "target_muscle": data.target_muscle,
        "started_at": datetime.now(timezone.utc),
        "ended_at": None,
        "status": "active",
        "device_id": data.device_id,
        "summary_metrics": None,
        "created_at": datetime.now(timezone.utc),
    }
    result = db.sessions.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


def stop_session(session_id: str) -> dict | None:
    db = get_db()
    session = db.sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        return None

    # ESP32 (หรือสคริปต์จำลอง) ไม่รู้จัก session_id -- มันแค่สตรีม telemetry ไปตาม device_id
    # ต่อเนื่อง ดังนั้น session หนึ่งๆ คือ "ช่วงเวลา started_at -> now ของ device_id นั้น"
    batches = list(
        db.telemetry_batches.find(
            {"device_id": session["device_id"], "batch_timestamp": {"$gte": session["started_at"]}}
        ).sort("batch_timestamp", 1)
    )
    summary = _summarize_batches(batches)

    db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {
            "$set": {
                "status": "completed",
                "ended_at": datetime.now(timezone.utc),
                "summary_metrics": summary,
            }
        },
    )
    session = db.sessions.find_one({"_id": ObjectId(session_id)})
    return _serialize(session)


def _parse_ts(ts):
    if isinstance(ts, str):
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return ts


def _summarize_batches(batches: list[dict]) -> dict:
    if not batches:
        return {}

    emg_rms_values = [b["metrics"]["emg"]["rms"] for b in batches if b.get("metrics", {}).get("emg", {}).get("rms") is not None]
    force_values = [b["metrics"]["fsr"]["force_newton"] for b in batches if b.get("metrics", {}).get("fsr", {}).get("force_newton") is not None]
    hr_values = [b["metrics"]["vitals"]["heart_rate"] for b in batches if b.get("metrics", {}).get("vitals", {}).get("heart_rate") is not None]
    spo2_values = [b["metrics"]["vitals"]["spo2"] for b in batches if b.get("metrics", {}).get("vitals", {}).get("spo2") is not None]
    skin_temp_values = [b["metrics"]["temperature"]["skin_temp_c"] for b in batches if b.get("metrics", {}).get("temperature", {}).get("skin_temp_c") is not None]

    # ใช้ช่วงเวลาของ batch แรก/สุดท้ายที่ "มีข้อมูลจริง" แทน started_at ของ session เพราะอาจมีช่วง
    # เวลาที่กดเริ่มแล้วแต่ยังไม่มีอุปกรณ์ส่งข้อมูลเข้ามา (เช่น เพิ่งขยับไปติดเซนเซอร์) ไม่ควรนับเป็น "ระยะเวลาที่ทำได้"
    first_ts = _parse_ts(batches[0].get("batch_timestamp"))
    last_ts = _parse_ts(batches[-1].get("batch_timestamp"))
    duration = (last_ts - first_ts).total_seconds() if first_ts and last_ts else None

    return {
        "duration_seconds": duration,
        "max_emg_rms": max(emg_rms_values) if emg_rms_values else None,
        "avg_emg_rms": sum(emg_rms_values) / len(emg_rms_values) if emg_rms_values else None,
        "max_force_newton": max(force_values) if force_values else None,
        "avg_heart_rate": sum(hr_values) / len(hr_values) if hr_values else None,
        "avg_spo2": sum(spo2_values) / len(spo2_values) if spo2_values else None,
        "max_skin_temp_c": max(skin_temp_values) if skin_temp_values else None,
    }


def create_manual_session(data: SessionManualCreate) -> dict:
    db = get_db()
    started_at = data.started_at or datetime.now(timezone.utc)
    ended_at = data.ended_at or started_at

    summary = data.summary_metrics.model_dump()
    if summary.get("duration_seconds") is None:
        summary["duration_seconds"] = (ended_at - started_at).total_seconds()

    doc = {
        "session_name": data.session_name,
        "subject_id": data.subject_id,
        "target_muscle": data.target_muscle,
        "started_at": started_at,
        "ended_at": ended_at,
        "status": "completed",
        "device_id": "MANUAL_ENTRY",
        "summary_metrics": summary,
        "created_at": datetime.now(timezone.utc),
    }
    result = db.sessions.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


def list_sessions_for_patient(patient_id: str) -> list[dict]:
    db = get_db()
    sessions = db.sessions.find({"subject_id": patient_id}).sort("started_at", -1)
    return [_serialize(s) for s in sessions]


def get_session_history(session_id: str) -> list[dict]:
    db = get_db()
    session = db.sessions.find_one({"_id": ObjectId(session_id)})
    if not session:
        return []

    query = {"device_id": session["device_id"], "batch_timestamp": {"$gte": session["started_at"]}}
    if session.get("ended_at"):
        query["batch_timestamp"]["$lte"] = session["ended_at"]

    batches = list(db.telemetry_batches.find(query, {"_id": 0}).sort("batch_timestamp", 1))
    return batches
