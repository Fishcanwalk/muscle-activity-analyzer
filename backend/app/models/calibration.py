from datetime import datetime

from pydantic import BaseModel


class CalibrationCreate(BaseModel):
    emgBaseline: float
    emgMvc: float
    fsrZero: float
    fsrMax: float


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
    )
