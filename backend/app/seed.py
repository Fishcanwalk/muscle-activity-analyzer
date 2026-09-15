from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.security import hash_password

DEMO_PASSWORD = "cyberpump123"

DEMO_USERS = [
    {"email": "nont@cyberpump.io", "name": "ธนาวัฒน์ (นนท์)"},
    {"email": "karn@cyberpump.io", "name": "กานต์ กิตติธร"},
    {"email": "suphawit@cyberpump.io", "name": "ศุภวิชญ์ พัฒนศักดิ์"},
]


async def seed_demo_users(db: AsyncIOMotorDatabase) -> None:
    password_hash = hash_password(DEMO_PASSWORD)
    for demo_user in DEMO_USERS:
        existing = await db.users.find_one({"email": demo_user["email"]})
        if existing is not None:
            continue
        await db.users.insert_one(
            {
                "email": demo_user["email"],
                "name": demo_user["name"],
                "password_hash": password_hash,
                "roles": ["user"],
                "created_at": datetime.now(timezone.utc),
                "is_active": True,
            }
        )
