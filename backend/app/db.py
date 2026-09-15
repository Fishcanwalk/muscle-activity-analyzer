from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

client: AsyncIOMotorClient = AsyncIOMotorClient(settings.MONGO_URI)
database: AsyncIOMotorDatabase = client.get_default_database()


def get_database() -> AsyncIOMotorDatabase:
    return database


async def create_indexes() -> None:
    await database.users.create_index("email", unique=True)
    await database.refresh_tokens.create_index("jti", unique=True)
    await database.telemetry_samples.create_index(
        "received_at",
        expireAfterSeconds=settings.TELEMETRY_RETENTION_DAYS * 86400,
    )
