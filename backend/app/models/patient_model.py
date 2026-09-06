from typing import Optional

from pydantic import BaseModel, Field


class PatientCreate(BaseModel):
    patient_id: str = Field(..., min_length=1, description="รหัสผู้ป่วย เช่น USER_001")
    name: str = Field(..., min_length=1)
    age: Optional[int] = Field(None, ge=0, le=150)
    target_muscle: Optional[str] = None
    note: Optional[str] = None
