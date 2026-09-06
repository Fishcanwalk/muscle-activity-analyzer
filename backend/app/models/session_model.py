from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SessionStart(BaseModel):
    session_name: str = Field(..., min_length=1)
    subject_id: str = Field(..., min_length=1)
    target_muscle: Optional[str] = None
    device_id: Optional[str] = "ESP32_MUSCLE_01"


class SummaryMetrics(BaseModel):
    duration_seconds: Optional[float] = None
    max_emg_rms: Optional[float] = None
    avg_emg_rms: Optional[float] = None
    max_force_newton: Optional[float] = None
    avg_heart_rate: Optional[float] = None
    avg_spo2: Optional[float] = None
    max_skin_temp_c: Optional[float] = None


class SessionManualCreate(BaseModel):
    """สร้าง session ที่บันทึกผลตรวจโดยกรอกเองจากฟอร์ม (ไม่ผ่าน ESP32 telemetry)"""

    session_name: str = Field(..., min_length=1)
    subject_id: str = Field(..., min_length=1)
    target_muscle: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    summary_metrics: SummaryMetrics
