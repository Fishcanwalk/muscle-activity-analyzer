"""In-memory live cache ตาม SYSTEM_SPEC.md 7.2 -- เตรียมไว้สำหรับ ESP32 ในอนาคต ยังไม่มี UI ใช้งานในรอบนี้"""

import threading
from datetime import datetime, timezone

from app.extensions import get_db

_lock = threading.Lock()
_live_cache: dict[str, dict] = {}


def _to_storage_doc(payload: dict) -> dict:
    """แปลง flat payload ตาม SYSTEM_SPEC.md 6.1 (wire format จาก ESP32) เป็น nested doc
    ตาม SYSTEM_SPEC.md 5.2 (time-series bucketing) ที่ session_service._summarize_batches() คาดหวัง"""
    ts = datetime.fromtimestamp(payload["timestamp_ms"] / 1000, tz=timezone.utc)
    accel = payload.get("accel") or [None, None, None]
    gyro = payload.get("gyro") or [None, None, None]

    return {
        "session_id": payload.get("session_id"),
        "device_id": payload["device_id"],
        "batch_timestamp": ts,
        "sample_count": len(payload.get("emg_samples") or []),
        "metrics": {
            "emg": {
                "samples": payload.get("emg_samples"),
                "rms": payload.get("emg_rms"),
                "mav": payload.get("emg_mav"),
            },
            "fsr": {
                "raw": payload.get("fsr_raw"),
                "force_newton": payload.get("fsr_force"),
            },
            "motion": {
                "accel_x": accel[0],
                "accel_y": accel[1],
                "accel_z": accel[2],
                "gyro_x": gyro[0],
                "gyro_y": gyro[1],
                "gyro_z": gyro[2],
                "pitch": payload.get("pitch"),
                "roll": payload.get("roll"),
            },
            "vitals": {
                "heart_rate": payload.get("heart_rate"),
                "spo2": payload.get("spo2"),
                "pulse_valid": payload.get("heart_rate") is not None,
            },
            "temperature": {
                "skin_temp_c": payload.get("skin_temp"),
                "ambient_temp_c": payload.get("ambient_temp"),
            },
        },
    }


def ingest_batch(payload: dict) -> None:
    db = get_db()
    device_id = payload["device_id"]

    with _lock:
        _live_cache[device_id] = {
            "device_id": device_id,
            "active_session": payload.get("session_id"),
            "is_online": True,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "metrics": {
                "emg_rms": payload.get("emg_rms"),
                "emg_mav": payload.get("emg_mav"),
                "emg_samples": payload.get("emg_samples"),
                "fsr_force": payload.get("fsr_force"),
                "pitch": payload.get("pitch"),
                "roll": payload.get("roll"),
                "heart_rate": payload.get("heart_rate"),
                "spo2": payload.get("spo2"),
                "skin_temp": payload.get("skin_temp"),
                "ambient_temp": payload.get("ambient_temp"),
            },
        }

    db.telemetry_batches.insert_one(_to_storage_doc(payload))


def get_live(device_id: str) -> dict | None:
    with _lock:
        return _live_cache.get(device_id)
