from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.billing.entitlements import as_utc
from app.billing.plans import Plan as PlanDef

BillingProvider = Literal["disabled", "mock", "omise"]
SubscriptionStatus = Literal["incomplete", "active", "past_due", "canceled"]


class PlanFeatures(BaseModel):
    historyDays: int | None


class Plan(BaseModel):
    id: str
    name: str
    priceSatang: int
    currency: str
    interval: str
    features: PlanFeatures


class BillingConfig(BaseModel):
    provider: BillingProvider
    # Only set for the omise provider -- the browser needs it to tokenize cards.
    omisePublicKey: str | None = None
    plans: list[Plan]


class Subscription(BaseModel):
    planId: str
    status: SubscriptionStatus
    provider: str
    currentPeriodStart: datetime | None = None
    currentPeriodEnd: datetime | None = None
    cancelAtPeriodEnd: bool = False
    lastError: str | None = None


class BillingOverview(BaseModel):
    # What the user can use right now (Free once a paid period has lapsed).
    plan: Plan
    subscription: Subscription | None


class CheckoutRequest(BaseModel):
    planId: str
    # Omise card token (tokn_...) from Omise.js; not needed for the mock provider.
    cardToken: str | None = None


class CheckoutResponse(BaseModel):
    subscription: Subscription
    # Set when the card needs 3-D Secure: send the browser here to finish the payment.
    authorizeUri: str | None = None


def plan_to_model(plan: PlanDef) -> Plan:
    return Plan(
        id=plan.id,
        name=plan.name,
        priceSatang=plan.price_satang,
        currency=plan.currency,
        interval=plan.interval,
        features=PlanFeatures(historyDays=plan.features.history_days),
    )


def subscription_doc_to_model(doc: dict) -> Subscription:
    return Subscription(
        planId=doc["plan_id"],
        status=doc["status"],
        provider=doc["provider"],
        currentPeriodStart=as_utc(doc.get("current_period_start")),
        currentPeriodEnd=as_utc(doc.get("current_period_end")),
        cancelAtPeriodEnd=doc.get("cancel_at_period_end", False),
        lastError=doc.get("last_error"),
    )
