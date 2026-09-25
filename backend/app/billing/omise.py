"""Thin async client for the parts of the Omise API subscriptions need.

Written against the Omise API reference (customers, charges, schedules, events) but not
yet exercised with real test keys -- run the checkout once with `skey_test_...` /
`pkey_test_...` before relying on it.
"""

from datetime import date
from typing import Any

import httpx

from app.config import settings

OMISE_API_URL = "https://api.omise.co"


class OmiseError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def is_configured() -> bool:
    return bool(settings.OMISE_SECRET_KEY and settings.OMISE_PUBLIC_KEY)


async def _request(method: str, path: str, data: dict[str, Any] | None = None) -> dict:
    # Omise authenticates with the secret key as the basic-auth username, no password.
    async with httpx.AsyncClient(
        base_url=OMISE_API_URL, auth=(settings.OMISE_SECRET_KEY, ""), timeout=20
    ) as client:
        response = await client.request(method, path, data=data)
    body = response.json()
    if response.status_code >= 400 or body.get("object") == "error":
        raise OmiseError(response.status_code, body.get("code", "unknown"), body.get("message", ""))
    return body


def _metadata(metadata: dict[str, str]) -> dict[str, str]:
    return {f"metadata[{key}]": value for key, value in metadata.items()}


async def create_customer(email: str, card_token: str, metadata: dict[str, str]) -> dict:
    return await _request(
        "POST",
        "/customers",
        {"email": email, "card": card_token, **_metadata(metadata)},
    )


async def attach_card(customer_id: str, card_token: str) -> dict:
    # Updating `card` adds it and makes it the customer's default card.
    return await _request("PATCH", f"/customers/{customer_id}", {"card": card_token})


async def create_charge(
    customer_id: str,
    amount: int,
    currency: str,
    description: str,
    return_uri: str,
    metadata: dict[str, str],
) -> dict:
    return await _request(
        "POST",
        "/charges",
        {
            "customer": customer_id,
            "amount": amount,
            "currency": currency,
            "description": description,
            # Required for 3-D Secure cards: the charge comes back `pending` with an
            # `authorize_uri`, and Omise redirects here once the bank has answered.
            "return_uri": return_uri,
            **_metadata(metadata),
        },
    )


async def retrieve_charge(charge_id: str) -> dict:
    return await _request("GET", f"/charges/{charge_id}")


async def create_monthly_schedule(
    customer_id: str,
    amount: int,
    currency: str,
    description: str,
    day_of_month: int,
    start: date,
    end: date,
) -> dict:
    return await _request(
        "POST",
        "/schedules",
        {
            "every": 1,
            "period": "month",
            "on[days_of_month][]": [day_of_month],
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "charge[customer]": customer_id,
            "charge[amount]": amount,
            "charge[currency]": currency,
            "charge[description]": description,
        },
    )


async def destroy_schedule(schedule_id: str) -> dict:
    return await _request("DELETE", f"/schedules/{schedule_id}")


async def retrieve_event(event_id: str) -> dict:
    return await _request("GET", f"/events/{event_id}")
