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
    await database.session_results.create_index([("user_id", 1), ("created_at", -1)])
    await database.session_results.create_index("session_id")
    await database.calibrations.create_index("user_id", unique=True)
    await database.telemetry_samples.create_index([("user_id", 1), ("received_at", -1)])
    await database.subscriptions.create_index("user_id", unique=True)
    await database.subscriptions.create_index("omise_customer_id", sparse=True)
    await database.subscriptions.create_index("pending_charge_id", sparse=True)
