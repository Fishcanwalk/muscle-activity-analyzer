from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query

from app.db import get_database
from app.models.session import SessionResult, SessionResultCreate, session_doc_to_model
from app.security import get_current_user

router = APIRouter(prefix="/v1/sessions", tags=["sessions"])


@router.post("", response_model=SessionResult)
async def create_session_result(
    body: SessionResultCreate,
    current_user: dict = Depends(get_current_user),
) -> SessionResult:
    db = get_database()
    doc = body.model_dump()
    doc["user_id"] = str(current_user["_id"])
    doc["created_at"] = datetime.now(timezone.utc)
    result = await db.session_results.insert_one(doc)
    doc["_id"] = result.inserted_id
    return session_doc_to_model(doc)


@router.get("", response_model=list[SessionResult])
async def list_session_results(
    limit: int = Query(default=50, le=200),
    current_user: dict = Depends(get_current_user),
) -> list[SessionResult]:
    db = get_database()
    cursor = (
        db.session_results.find({"user_id": str(current_user["_id"])})
        .sort("created_at", -1)
        .limit(limit)
    )
    return [session_doc_to_model(doc) async for doc in cursor]
