from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.billing.entitlements import get_user_plan
from app.db import get_database
from app.models.session import (
    SessionComparison,
    SessionResult,
    SessionResultCreate,
    session_doc_to_model,
)
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
    session_id: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
) -> list[SessionResult]:
    db = get_database()
    user_id = str(current_user["_id"])
    query: dict = {"user_id": user_id}
    # Older sets stay stored; the plan only limits how far back they're returned.
    history_days = (await get_user_plan(db, user_id)).features.history_days
    if history_days is not None:
        query["created_at"] = {"$gte": datetime.now(timezone.utc) - timedelta(days=history_days)}
    if session_id is not None:
        query["session_id"] = session_id
    cursor = db.session_results.find(query).sort("created_at", -1).limit(limit)
    return [session_doc_to_model(doc) async for doc in cursor]


@router.get("/{session_id}/comparison", response_model=SessionComparison)
async def compare_with_previous_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
) -> SessionComparison:
    """The given session next to the same user's previous one (by start time).

    Deliberately not limited by the plan's history window: the post-workout comparison
    must always find the previous session, however long ago it was."""
    db = get_database()
    user_id = str(current_user["_id"])
    current_docs = await db.session_results.find(
        {"user_id": user_id, "session_id": session_id}
    ).sort("created_at", 1).to_list(length=None)
    if not current_docs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Also matches older sets saved without a session_id (each its own session).
    previous_last_set = await db.session_results.find_one(
        {
            "user_id": user_id,
            "session_id": {"$ne": session_id},
            "created_at": {"$lt": current_docs[0]["created_at"]},
        },
        sort=[("created_at", -1)],
    )
    previous_docs: list[dict] = []
    if previous_last_set is not None:
        previous_session_id = previous_last_set.get("session_id")
        previous_docs = (
            await db.session_results.find(
                {"user_id": user_id, "session_id": previous_session_id}
            ).sort("created_at", 1).to_list(length=None)
            if previous_session_id
            else [previous_last_set]
        )

    return SessionComparison(
        current=[session_doc_to_model(doc) for doc in current_docs],
        previous=[session_doc_to_model(doc) for doc in previous_docs],
    )
