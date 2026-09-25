from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.billing.entitlements import as_utc
from app.db import get_database
from app.models.session import SessionResult, session_doc_to_model
from app.models.user import PublicUser, User, user_doc_to_model
from app.security import get_current_user

router = APIRouter(tags=["users"])


@router.get("/users/me", response_model=User)
async def get_current_user_info(current_user: dict = Depends(get_current_user)) -> User:
    return user_doc_to_model(current_user)


# Per-user workout totals, keyed by user_id. Sets saved without a session_id count as
# their own session, the same rule the frontend's groupSetsIntoSessions uses.
async def _workout_stats(db, user_ids: list[str]) -> dict[str, dict]:
    cursor = db.session_results.aggregate(
        [
            {"$match": {"user_id": {"$in": user_ids}}},
            {
                "$group": {
                    "_id": "$user_id",
                    "setCount": {"$sum": 1},
                    "sessions": {"$addToSet": {"$ifNull": ["$session_id", {"$toString": "$_id"}]}},
                    "lastWorkoutAt": {"$max": "$created_at"},
                }
            },
        ]
    )
    return {doc["_id"]: doc async for doc in cursor}


def _public_user(doc: dict, stats: dict | None) -> PublicUser:
    return PublicUser(
        id=str(doc["_id"]),
        name=doc["name"],
        avatar=doc.get("avatar"),
        sessionCount=len(stats["sessions"]) if stats else 0,
        setCount=stats["setCount"] if stats else 0,
        lastWorkoutAt=as_utc(stats["lastWorkoutAt"]) if stats else None,
    )


@router.get("/v1/users", response_model=list[PublicUser])
async def list_users(current_user: dict = Depends(get_current_user)) -> list[PublicUser]:
    """Everyone else the caller can compare themselves with, most recently active first."""
    db = get_database()
    docs = await db.users.find(
        {"_id": {"$ne": current_user["_id"]}, "is_active": {"$ne": False}}
    ).to_list(length=None)
    stats = await _workout_stats(db, [str(doc["_id"]) for doc in docs])
    users = [_public_user(doc, stats.get(str(doc["_id"]))) for doc in docs]
    never = datetime.min.replace(tzinfo=timezone.utc)
    return sorted(users, key=lambda u: u.lastWorkoutAt or never, reverse=True)


class UserPerformance(BaseModel):
    user: PublicUser
    # Most recent sets first, capped by `limit`.
    sets: list[SessionResult]


@router.get("/v1/users/{user_id}/performance", response_model=UserPerformance)
async def get_user_performance(
    user_id: str,
    limit: int = Query(default=200, le=500, gt=0),
    current_user: dict = Depends(get_current_user),
) -> UserPerformance:
    """Any user's saved sets (the caller's own included) for the user-vs-user comparison.

    Not limited by the plan's history window, so both sides are compared over the same span."""
    try:
        object_id = ObjectId(user_id)
    except (InvalidId, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found") from exc
    db = get_database()
    doc = await db.users.find_one({"_id": object_id, "is_active": {"$ne": False}})
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    stats = await _workout_stats(db, [user_id])
    cursor = db.session_results.find({"user_id": user_id}).sort("created_at", -1).limit(limit)
    return UserPerformance(
        user=_public_user(doc, stats.get(user_id)),
        sets=[session_doc_to_model(set_doc) async for set_doc in cursor],
    )
