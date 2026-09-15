from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from app.db import get_database
from app.models.telemetry import TelemetryIngest
from app.security import get_current_user

router = APIRouter(prefix="/v1/telemetry", tags=["telemetry"])


async def require_service_token(x_service_token: str | None = Header(default=None)) -> None:
    # Machine-to-machine hop from the SvelteKit server (not a browser session),
    # so this uses a shared secret instead of a user access token.
    if not x_service_token or x_service_token != settings.TELEMETRY_SERVICE_TOKEN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid service token")


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_service_token)])
async def ingest_telemetry(
    packet: TelemetryIngest, db: AsyncIOMotorDatabase = Depends(get_database)
) -> dict:
    doc = packet.model_dump()
    doc["received_at"] = datetime.now(timezone.utc)
    result = await db.telemetry_samples.insert_one(doc)
    return {"id": str(result.inserted_id)}


@router.get("")
async def get_telemetry_history(
    since: int | None = Query(default=None),
    limit: int = Query(default=500, le=2000, gt=0),
    db: AsyncIOMotorDatabase = Depends(get_database),
    _current_user: dict = Depends(get_current_user),
) -> list[dict]:
    query: dict = {}
    if since is not None:
        since_dt = datetime.fromtimestamp(since / 1000, tz=timezone.utc)
        query["received_at"] = {"$gte": since_dt}

    cursor = db.telemetry_samples.find(query).sort("received_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    for doc in docs:
        doc["id"] = str(doc.pop("_id"))
    return docs
