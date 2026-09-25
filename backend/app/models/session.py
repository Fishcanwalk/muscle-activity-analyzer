from datetime import datetime

from pydantic import BaseModel, Field


class RepResult(BaseModel):
    repNumber: int
    concentricVelocity: float
    rom: float
    isClean: bool
    velocityLossPercent: float
    peakEmg: float
    cheatReason: str | None = None


class SessionResultCreate(BaseModel):
    setNumber: int
    exercise: str
    weightKg: float
    durationSeconds: float
    totalReps: int
    cleanReps: int
    cheatedReps: int
    formPurityPercent: float
    effectiveReps: int
    highTensionTutSeconds: float
    reps: list[RepResult] = Field(default_factory=list)
    timestamp: str | None = None
    session_id: str | None = None
    # How reps were counted for this set: "camera", "emg" or "hybrid".
    repSource: str | None = None
    # The MVC (µV) calibrated at the start of this set's session. Calibration is redone
    # every session, so a rep's peakEmg is only comparable as a % of its own session's MVC.
    emgMvcUv: float | None = None


class SessionResult(SessionResultCreate):
    id: str
    user_id: str
    created_at: datetime


class SessionComparison(BaseModel):
    # Every set of the requested session, and of the same user's session right before it
    # (empty when this is their first one).
    current: list[SessionResult]
    previous: list[SessionResult]


def session_doc_to_model(doc: dict) -> SessionResult:
    return SessionResult(
        id=str(doc["_id"]),
        user_id=doc["user_id"],
        created_at=doc["created_at"],
        setNumber=doc["setNumber"],
        exercise=doc["exercise"],
        weightKg=doc["weightKg"],
        durationSeconds=doc["durationSeconds"],
        totalReps=doc["totalReps"],
        cleanReps=doc["cleanReps"],
        cheatedReps=doc["cheatedReps"],
        formPurityPercent=doc["formPurityPercent"],
        effectiveReps=doc["effectiveReps"],
        highTensionTutSeconds=doc["highTensionTutSeconds"],
        reps=doc.get("reps", []),
        timestamp=doc.get("timestamp"),
        session_id=doc.get("session_id"),
        repSource=doc.get("repSource"),
        emgMvcUv=doc.get("emgMvcUv"),
    )
