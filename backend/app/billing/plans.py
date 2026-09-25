from dataclasses import dataclass


@dataclass(frozen=True)
class PlanFeatures:
    # None = unlimited history.
    history_days: int | None


@dataclass(frozen=True)
class Plan:
    id: str
    name: str
    # Omise amounts are in the smallest currency unit (satang for THB).
    price_satang: int
    currency: str
    interval: str
    features: PlanFeatures


FREE_PLAN_ID = "free"

# Placeholder pricing/limits -- the only place to change what each plan allows.
PLANS: dict[str, Plan] = {
    FREE_PLAN_ID: Plan(
        id=FREE_PLAN_ID,
        name="Free",
        price_satang=0,
        currency="thb",
        interval="month",
        features=PlanFeatures(history_days=30),
    ),
    "pro": Plan(
        id="pro",
        name="Pro",
        price_satang=19900,
        currency="thb",
        interval="month",
        features=PlanFeatures(history_days=None),
    ),
}


def get_plan(plan_id: str | None) -> Plan:
    return PLANS.get(plan_id or FREE_PLAN_ID, PLANS[FREE_PLAN_ID])
