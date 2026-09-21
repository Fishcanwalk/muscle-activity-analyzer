from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pymongo import ReturnDocument

from app.db import get_database
from app.models.calibration import Calibration, CalibrationCreate, calibration_doc_to_model
from app.security import get_current_user

router = APIRouter(prefix="/v1/calibration", tags=["calibration"])

DEFAULT_CALIBRATION = {
    "emgBaseline": 0,
    "emgMvc": 550,
    "fsrZero": 0,
    "fsrMax": 4095,
}


@router.get("", response_model=Calibration)
async def get_calibration(current_user: dict = Depends(get_current_user)) -> Calibration:
    db = get_database()
    user_id = str(current_user["_id"])
    doc = await db.calibrations.find_one({"user_id": user_id})
    if doc is None:
        return Calibration(
            user_id=user_id,
            updated_at=datetime.now(timezone.utc),
            **DEFAULT_CALIBRATION,
        )
    return calibration_doc_to_model(doc)


@router.post("", response_model=Calibration)
async def upsert_calibration(
    body: CalibrationCreate,
    current_user: dict = Depends(get_current_user),
) -> Calibration:
    db = get_database()
    user_id = str(current_user["_id"])
    update = body.model_dump()
    update["user_id"] = user_id
    update["updated_at"] = datetime.now(timezone.utc)
    doc = await db.calibrations.find_one_and_update(
        {"user_id": user_id},
        {"$set": update},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return calibration_doc_to_model(doc)
