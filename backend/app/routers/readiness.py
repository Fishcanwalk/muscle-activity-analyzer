import statistics
from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.db import get_database
from app.models.readiness import GripTestCreate, GripTestResult
from app.security import get_current_user

router = APIRouter(prefix="/v1/readiness", tags=["readiness"])

# How many of the latest earlier tests make up the "normal grip" baseline. The median
# keeps one unusually weak (or strong) day from shifting it.
BASELINE_TESTS = 5


@router.post("/grip", response_model=GripTestResult)
async def record_grip_test(
    body: GripTestCreate,
    current_user: dict = Depends(get_current_user),
) -> GripTestResult:
    """Saves a pre-workout grip test and compares it with the user's recent ones."""
    db = get_database()
    user_id = str(current_user["_id"])
    previous = await db.grip_tests.find({"user_id": user_id}).sort("created_at", -1).to_list(
        length=BASELINE_TESTS
    )
    await db.grip_tests.insert_one(
        {
            "user_id": user_id,
            "peak_span_adc": body.peakSpanAdc,
            "created_at": datetime.now(timezone.utc),
        }
    )

    baseline = statistics.median(doc["peak_span_adc"] for doc in previous) if previous else None
    return GripTestResult(
        peakSpanAdc=body.peakSpanAdc,
        baselineSpanAdc=baseline,
        readinessPercent=round(body.peakSpanAdc / baseline * 100) if baseline else None,
        previousTests=len(previous),
    )
