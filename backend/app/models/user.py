from datetime import datetime, timezone

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False


class User(BaseModel):
    id: str
    email: str
    name: str
    avatar: str | None = None
    roles: list[str] = Field(default_factory=lambda: ["user"])
    created_at: datetime
    is_active: bool = True


class PublicUser(BaseModel):
    # What other users may see: no email, no roles.
    id: str
    name: str
    avatar: str | None = None
    sessionCount: int = 0
    setCount: int = 0
    lastWorkoutAt: datetime | None = None


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


def user_doc_to_model(doc: dict) -> User:
    return User(
        id=str(doc["_id"]),
        email=doc["email"],
        name=doc["name"],
        avatar=doc.get("avatar"),
        roles=doc.get("roles", ["user"]),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
        is_active=doc.get("is_active", True),
    )
