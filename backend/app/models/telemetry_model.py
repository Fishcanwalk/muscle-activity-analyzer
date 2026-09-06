from typing import List, Optional

from pydantic import BaseModel


class TelemetryBatch(BaseModel):
    """ตาม SYSTEM_SPEC.md 6.1 -- ยังไม่ได้ต่อ UI ใช้งานจริงในรอบนี้ เตรียมไว้สำหรับ ESP32"""

    device_id: str
    session_id: Optional[str] = None
    timestamp_ms: int
    emg_samples: Optional[List[float]] = None
    emg_rms: Optional[float] = None
    emg_mav: Optional[float] = None
    fsr_raw: Optional[float] = None
    fsr_force: Optional[float] = None
    accel: Optional[List[float]] = None
    gyro: Optional[List[float]] = None
    pitch: Optional[float] = None
    roll: Optional[float] = None
    heart_rate: Optional[float] = None
    spo2: Optional[float] = None
    skin_temp: Optional[float] = None
    ambient_temp: Optional[float] = None
