from datetime import datetime, timedelta, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from app.db import get_database
from app.models.user import Token, User, UserCreate, UserLogin, user_doc_to_model
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/v1/auth", tags=["auth"])
bearer_scheme = HTTPBearer()


async def _issue_token_pair(user: dict, db: AsyncIOMotorDatabase) -> Token:
    access_token = create_access_token(user)
    refresh_token, jti = create_refresh_token(user)
    now = datetime.now(timezone.utc)
    await db.refresh_tokens.insert_one(
        {
            "jti": jti,
            "user_id": str(user["_id"]),
            "revoked": False,
            "created_at": now,
            "expires_at": now + timedelta(seconds=settings.REFRESH_TTL_S),
        }
    )
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TTL_S,
    )


@router.post("/register", response_model=Token)
async def register_user(body: UserCreate, db: AsyncIOMotorDatabase = Depends(get_database)) -> Token:
    existing = await db.users.find_one({"email": body.email})
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    doc = {
        "email": body.email,
        "name": body.name,
        "password_hash": hash_password(body.password),
        "roles": ["user"],
        "created_at": datetime.now(timezone.utc),
        "is_active": True,
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return await _issue_token_pair(doc, db)


@router.post("/login", response_model=Token)
async def login_user(body: UserLogin, db: AsyncIOMotorDatabase = Depends(get_database)) -> Token:
    user = await db.users.find_one({"email": body.email})
    if user is None or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    return await _issue_token_pair(user, db)


@router.post("/refresh", response_model=Token)
async def refresh_token(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> Token:
    # The SvelteKit proxy calls this with only an Authorization header and no
    # JSON body, so the refresh token is read from the header, not the body.
    payload = decode_token(credentials.credentials, expected_type="refresh")

    record = await db.refresh_tokens.find_one({"jti": payload["jti"]})
    if record is None or record.get("revoked"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    expires_at = record["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    try:
        user_object_id = ObjectId(payload["sub"])
    except (InvalidId, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    user = await db.users.find_one({"_id": user_object_id})
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    await db.refresh_tokens.update_one({"jti": payload["jti"]}, {"$set": {"revoked": True}})

    return await _issue_token_pair(user, db)


@router.post("/logout")
async def logout_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    payload = decode_token(credentials.credentials, expected_type="access")
    await db.refresh_tokens.update_many({"user_id": payload["sub"]}, {"$set": {"revoked": True}})
    return {"success": True}


@router.get("/verify", response_model=User)
async def verify_token(current_user: dict = Depends(get_current_user)) -> User:
    return user_doc_to_model(current_user)
