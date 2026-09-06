from datetime import datetime, timezone

from app.extensions import get_db
from app.models.patient_model import PatientCreate


def list_patients() -> list[dict]:
    db = get_db()
    patients = list(db.patients.find({}, {"_id": 0}).sort("created_at", -1))
    return patients


def get_patient(patient_id: str) -> dict | None:
    db = get_db()
    return db.patients.find_one({"patient_id": patient_id}, {"_id": 0})


def create_patient(data: PatientCreate) -> dict:
    db = get_db()
    if db.patients.find_one({"patient_id": data.patient_id}):
        raise ValueError(f"patient_id '{data.patient_id}' already exists")

    doc = data.model_dump()
    doc["created_at"] = datetime.now(timezone.utc)
    db.patients.insert_one(doc)
    doc.pop("_id", None)
    return doc
