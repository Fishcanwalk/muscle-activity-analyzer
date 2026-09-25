from datetime import datetime

from pydantic import BaseModel


# Defaults for the EMG rep-counting thresholds (percent of the user's calibrated MVC),
# used for calibration documents saved before these fields existed.
DEFAULT_EMG_REP_ON_PCT = 35.0
DEFAULT_EMG_REP_OFF_PCT = 20.0
DEFAULT_EMG_REP_PEAK_PCT = 45.0


class CalibrationCreate(BaseModel):
    emgBaseline: float
    emgMvc: float
    fsrZero: float
    fsrMax: float
    # A contraction starts above emgRepOnPct and a rep is counted once it falls back
    # below emgRepOffPct; reps whose peak stays under emgRepPeakPct are flagged as
    # low muscle activation. See frontend/src/lib/server/emgRepDetector.ts.
    emgRepOnPct: float = DEFAULT_EMG_REP_ON_PCT
    emgRepOffPct: float = DEFAULT_EMG_REP_OFF_PCT
    emgRepPeakPct: float = DEFAULT_EMG_REP_PEAK_PCT


class Calibration(CalibrationCreate):
    user_id: str
    updated_at: datetime


def calibration_doc_to_model(doc: dict) -> Calibration:
    return Calibration(
        user_id=doc["user_id"],
        updated_at=doc["updated_at"],
        emgBaseline=doc["emgBaseline"],
        emgMvc=doc["emgMvc"],
        fsrZero=doc["fsrZero"],
        fsrMax=doc["fsrMax"],
        emgRepOnPct=doc.get("emgRepOnPct", DEFAULT_EMG_REP_ON_PCT),
        emgRepOffPct=doc.get("emgRepOffPct", DEFAULT_EMG_REP_OFF_PCT),
        emgRepPeakPct=doc.get("emgRepPeakPct", DEFAULT_EMG_REP_PEAK_PCT),
    )
