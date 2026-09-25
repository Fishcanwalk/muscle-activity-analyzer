import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.billing import omise
from app.billing.entitlements import (
    add_months,
    as_utc,
    billing_anchor,
    effective_plan_id,
    get_subscription,
)
from app.billing.plans import PLANS, Plan, get_plan
from app.config import settings
from app.db import get_database
from app.models.billing import (
    BillingConfig,
    BillingOverview,
    CheckoutRequest,
    CheckoutResponse,
    plan_to_model,
    subscription_doc_to_model,
)
from app.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/billing", tags=["billing"])

# One `subscriptions` document per user. Card payments through Omise:
#   checkout -> Omise customer (card from an Omise.js token) + a charge for the first
#   month. Once that charge is successful the period starts and an Omise schedule charges
#   the same customer every month; each renewal arrives as a `charge.complete` webhook.
# 3-D Secure cards come back `pending` with an authorize_uri; the user finishes on their
# bank's page, returns to /billing, and POST /refresh (or the webhook) applies the result.

SCHEDULE_LENGTH_MONTHS = 24


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _paid_plan(plan_id: str) -> Plan:
    plan = PLANS.get(plan_id)
    if plan is None or plan.price_satang == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown paid plan")
    return plan


def _charge_description(plan: Plan) -> str:
    return f"Cyberpump {plan.name} (1 month)"


def _first_period(now: datetime) -> tuple[datetime, datetime]:
    # Starts now, ends on the next billing anchor a month out (the day Omise will renew).
    return now, add_months(billing_anchor(now), 1)


async def _overview(db: AsyncIOMotorDatabase, user_id: str) -> BillingOverview:
    sub = await get_subscription(db, user_id)
    now = _now()
    if sub and sub["status"] == "active" and effective_plan_id(sub, now) != sub["plan_id"]:
        # The paid period ran out without a renewal (canceled, or a mock plan).
        await db.subscriptions.update_one({"_id": sub["_id"]}, {"$set": {"status": "canceled"}})
        sub["status"] = "canceled"
    return BillingOverview(
        plan=plan_to_model(get_plan(effective_plan_id(sub, now))),
        subscription=subscription_doc_to_model(sub) if sub else None,
    )


async def _schedule_renewals(sub: dict, plan: Plan, period_end: datetime) -> tuple[str | None, str | None]:
    """Returns (schedule_id, error). The period is already paid, so a failure here only
    means auto-renewal is off -- it's surfaced to the user rather than failing checkout."""
    try:
        schedule = await omise.create_monthly_schedule(
            sub["omise_customer_id"],
            plan.price_satang,
            plan.currency,
            _charge_description(plan),
            day_of_month=period_end.day,
            start=period_end.date(),
            end=add_months(period_end, SCHEDULE_LENGTH_MONTHS).date(),
        )
        return schedule["id"], None
    except omise.OmiseError as exc:
        logger.warning("Omise schedule creation failed: %s", exc.message)
        return None, f"Auto-renewal could not be scheduled: {exc.message}"


async def _destroy_schedule(sub: dict) -> None:
    schedule_id = sub.get("omise_schedule_id")
    if not schedule_id:
        return
    try:
        await omise.destroy_schedule(schedule_id)
    except omise.OmiseError as exc:
        logger.warning("Omise schedule %s could not be destroyed: %s", schedule_id, exc.message)


async def _apply_first_charge(db: AsyncIOMotorDatabase, user_id: str, charge: dict) -> None:
    if charge.get("status") == "pending":
        return
    # Claim the pending charge atomically so the webhook and /refresh can't both apply it
    # (and create two renewal schedules).
    sub = await db.subscriptions.find_one_and_update(
        {"user_id": user_id, "pending_charge_id": charge["id"]},
        {"$unset": {"pending_charge_id": ""}},
        return_document=ReturnDocument.BEFORE,
    )
    if sub is None:
        return

    if charge.get("status") != "successful":
        await db.subscriptions.update_one(
            {"_id": sub["_id"]},
            {
                "$set": {"last_error": charge.get("failure_message") or "Payment failed"},
                "$unset": {"pending_plan_id": ""},
            },
        )
        return

    plan = get_plan(sub.get("pending_plan_id"))
    start, end = _first_period(_now())
    await _destroy_schedule(sub)
    schedule_id, schedule_error = await _schedule_renewals(sub, plan, end)
    await db.subscriptions.update_one(
        {"_id": sub["_id"]},
        {
            "$set": {
                "plan_id": plan.id,
                "status": "active",
                "current_period_start": start,
                "current_period_end": end,
                "cancel_at_period_end": False,
                "omise_schedule_id": schedule_id,
                "last_charge_id": charge["id"],
                "last_error": schedule_error,
                "updated_at": _now(),
            },
            "$unset": {"pending_plan_id": ""},
        },
    )


async def _apply_renewal_charge(db: AsyncIOMotorDatabase, charge: dict) -> None:
    sub = await db.subscriptions.find_one({"omise_customer_id": charge.get("customer")})
    if sub is None or charge["id"] in (sub.get("pending_charge_id"), sub.get("last_charge_id")):
        return

    if charge.get("status") != "successful":
        await db.subscriptions.update_one(
            {"_id": sub["_id"]},
            {
                "$set": {
                    "status": "past_due",
                    "last_error": charge.get("failure_message") or "Renewal payment failed",
                    "updated_at": _now(),
                }
            },
        )
        return

    now = _now()
    previous_end = as_utc(sub.get("current_period_end")) or now
    # Continue from the old period so periods don't drift; restart if it lapsed long ago.
    start = previous_end if previous_end > now - timedelta(days=7) else now
    await db.subscriptions.update_one(
        {"_id": sub["_id"], "last_charge_id": {"$ne": charge["id"]}},
        {
            "$set": {
                "status": "active",
                "current_period_start": start,
                "current_period_end": add_months(start, 1),
                "last_charge_id": charge["id"],
                "last_error": None,
                "updated_at": now,
            }
        },
    )


@router.get("/config", response_model=BillingConfig)
async def get_billing_config() -> BillingConfig:
    is_omise = settings.BILLING_PROVIDER == "omise"
    return BillingConfig(
        provider=settings.BILLING_PROVIDER,
        omisePublicKey=(settings.OMISE_PUBLIC_KEY or None) if is_omise else None,
        plans=[plan_to_model(plan) for plan in PLANS.values()],
    )


@router.get("/subscription", response_model=BillingOverview)
async def get_billing_overview(current_user: dict = Depends(get_current_user)) -> BillingOverview:
    return await _overview(get_database(), str(current_user["_id"]))


@router.post("/checkout", response_model=CheckoutResponse)
async def checkout(
    body: CheckoutRequest, current_user: dict = Depends(get_current_user)
) -> CheckoutResponse:
    db = get_database()
    user_id = str(current_user["_id"])
    plan = _paid_plan(body.planId)
    provider = settings.BILLING_PROVIDER
    if provider == "disabled":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Billing is disabled")

    sub = await get_subscription(db, user_id)
    if effective_plan_id(sub) == plan.id:
        if sub.get("cancel_at_period_end"):
            await resume_subscription(current_user)
            sub = await get_subscription(db, user_id)
            return CheckoutResponse(subscription=subscription_doc_to_model(sub))
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already on this plan")

    now = _now()
    if provider == "mock":
        # Dev only: no money moves, the plan is simply switched on for a month.
        start, end = _first_period(now)
        sub = await db.subscriptions.find_one_and_update(
            {"user_id": user_id},
            {
                "$set": {
                    "plan_id": plan.id,
                    "status": "active",
                    "provider": "mock",
                    "current_period_start": start,
                    "current_period_end": end,
                    "cancel_at_period_end": False,
                    "last_error": None,
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        return CheckoutResponse(subscription=subscription_doc_to_model(sub))

    if not omise.is_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Omise keys are not set")
    if not body.cardToken:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cardToken is required")

    try:
        customer_id = sub.get("omise_customer_id") if sub else None
        if customer_id:
            await omise.attach_card(customer_id, body.cardToken)
        else:
            customer = await omise.create_customer(
                current_user["email"], body.cardToken, {"user_id": user_id}
            )
            customer_id = customer["id"]
        charge = await omise.create_charge(
            customer_id,
            plan.price_satang,
            plan.currency,
            _charge_description(plan),
            return_uri=f"{settings.APP_BASE_URL.rstrip('/')}/billing?omise_return=1",
            metadata={"user_id": user_id, "plan_id": plan.id},
        )
    except omise.OmiseError as exc:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=exc.message) from exc

    await db.subscriptions.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "provider": "omise",
                "omise_customer_id": customer_id,
                "pending_plan_id": plan.id,
                "pending_charge_id": charge["id"],
                "updated_at": now,
            },
            "$setOnInsert": {"plan_id": plan.id, "status": "incomplete", "created_at": now},
        },
        upsert=True,
    )
    await _apply_first_charge(db, user_id, charge)

    sub = await get_subscription(db, user_id)
    if charge.get("status") == "failed":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=charge.get("failure_message") or "Payment failed",
        )
    return CheckoutResponse(
        subscription=subscription_doc_to_model(sub),
        authorizeUri=charge.get("authorize_uri") if charge.get("status") == "pending" else None,
    )


@router.post("/refresh", response_model=BillingOverview)
async def refresh_subscription(current_user: dict = Depends(get_current_user)) -> BillingOverview:
    """Re-check a pending (3-D Secure) charge -- used when returning from the bank page,
    and the only way it completes in local dev where Omise webhooks can't reach us."""
    db = get_database()
    user_id = str(current_user["_id"])
    sub = await get_subscription(db, user_id)
    if sub and sub.get("pending_charge_id") and omise.is_configured():
        try:
            charge = await omise.retrieve_charge(sub["pending_charge_id"])
            await _apply_first_charge(db, user_id, charge)
        except omise.OmiseError as exc:
            logger.warning("Omise charge lookup failed: %s", exc.message)
    return await _overview(db, user_id)


@router.post("/cancel", response_model=BillingOverview)
async def cancel_subscription(current_user: dict = Depends(get_current_user)) -> BillingOverview:
    db = get_database()
    user_id = str(current_user["_id"])
    sub = await get_subscription(db, user_id)
    if sub is None or get_plan(effective_plan_id(sub)).price_satang == 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No paid plan to cancel")
    # Keeps the plan until the end of the period that's already paid for.
    await _destroy_schedule(sub)
    await db.subscriptions.update_one(
        {"_id": sub["_id"]},
        {"$set": {"cancel_at_period_end": True, "omise_schedule_id": None, "updated_at": _now()}},
    )
    return await _overview(db, user_id)


@router.post("/resume", response_model=BillingOverview)
async def resume_subscription(current_user: dict = Depends(get_current_user)) -> BillingOverview:
    db = get_database()
    user_id = str(current_user["_id"])
    sub = await get_subscription(db, user_id)
    if sub is None or not sub.get("cancel_at_period_end") or effective_plan_id(sub) != sub["plan_id"]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nothing to resume")

    update: dict = {"cancel_at_period_end": False, "updated_at": _now()}
    if sub["provider"] == "omise":
        schedule_id, schedule_error = await _schedule_renewals(
            sub, get_plan(sub["plan_id"]), as_utc(sub["current_period_end"])
        )
        if schedule_id is None:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=schedule_error)
        update["omise_schedule_id"] = schedule_id
    await db.subscriptions.update_one({"_id": sub["_id"]}, {"$set": update})
    return await _overview(db, user_id)


@router.post("/webhooks/omise", status_code=status.HTTP_200_OK)
async def omise_webhook(request: Request) -> dict:
    if settings.BILLING_PROVIDER != "omise" or not omise.is_configured():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    payload = await request.json()
    event_id = payload.get("id") if isinstance(payload, dict) else None
    if not isinstance(event_id, str) or not event_id.startswith("evnt_"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not an Omise event")

    # The request body is untrusted: re-fetch the event from Omise with our secret key and
    # act only on what Omise itself returns.
    try:
        event = await omise.retrieve_event(event_id)
    except omise.OmiseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown event") from exc

    db = get_database()
    try:
        await db.billing_events.insert_one(
            {"_id": event_id, "key": event.get("key"), "received_at": _now()}
        )
    except DuplicateKeyError:
        return {"ok": True, "duplicate": True}

    charge = event.get("data") or {}
    if event.get("key") == "charge.complete" and charge.get("object") == "charge":
        pending = await db.subscriptions.find_one({"pending_charge_id": charge.get("id")})
        if pending is not None:
            await _apply_first_charge(db, pending["user_id"], charge)
        elif charge.get("customer"):
            # Any other completed charge on a subscriber's customer is a schedule renewal.
            await _apply_renewal_charge(db, charge)
    return {"ok": True}
