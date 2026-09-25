import calendar
from datetime import datetime, timedelta, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.billing.plans import FREE_PLAN_ID, Plan, get_plan

# An auto-renewing plan stays usable this long past its period end, covering both a late
# renewal webhook and a failed renewal charge (past_due) before it drops to Free.
RENEWAL_GRACE = timedelta(days=3)
# Omise schedules only accept days 1-28, so every billing anchor is clamped to 28.
MAX_BILLING_DAY = 28


def as_utc(dt: datetime | None) -> datetime | None:
    # Motor returns naive datetimes (the client isn't tz_aware); they're stored as UTC.
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def add_months(dt: datetime, months: int) -> datetime:
    month_index = dt.month - 1 + months
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def billing_anchor(now: datetime) -> datetime:
    """Start of today's billing period, pulled back to the 28th when later in the month."""
    return now.replace(day=min(now.day, MAX_BILLING_DAY))


def effective_plan_id(subscription: dict | None, now: datetime | None = None) -> str:
    if not subscription:
        return FREE_PLAN_ID
    now = now or datetime.now(timezone.utc)
    period_end = as_utc(subscription.get("current_period_end"))
    if period_end is None:
        return FREE_PLAN_ID
    if subscription.get("status") not in ("active", "past_due"):
        return FREE_PLAN_ID
    renews = subscription.get("provider") == "omise" and not subscription.get("cancel_at_period_end")
    grace = RENEWAL_GRACE if renews else timedelta(0)
    return subscription["plan_id"] if period_end + grace > now else FREE_PLAN_ID


async def get_subscription(db: AsyncIOMotorDatabase, user_id: str) -> dict | None:
    return await db.subscriptions.find_one({"user_id": user_id})


async def get_user_plan(db: AsyncIOMotorDatabase, user_id: str) -> Plan:
    return get_plan(effective_plan_id(await get_subscription(db, user_id)))
