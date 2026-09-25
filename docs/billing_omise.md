# Subscriptions (Omise)

## Plans

Plans are defined in `backend/app/billing/plans.py` (placeholder prices and limits):

| Plan | Price       | History returned by `GET /v1/sessions` |
|------|-------------|----------------------------------------|
| Free | 0           | last 30 days                           |
| Pro  | ฿199/month  | everything                             |

Old sets are never deleted. The plan only limits how far back the list endpoint returns
them. The post-workout comparison (`GET /v1/sessions/{id}/comparison`) and the
user-vs-user comparison (`GET /v1/users/{id}/performance`) ignore this window, so they
always find the previous session and compare both users over the same span.

## Billing providers (`BILLING_PROVIDER` in `backend/.env`)

- `disabled` (default): checkout returns 503.
- `mock`: for local dev only. Checkout switches Pro on for a month and never charges.
- `omise`: charges real cards. Set `OMISE_PUBLIC_KEY`, `OMISE_SECRET_KEY` and
  `APP_BASE_URL` (the public frontend URL, used for the 3-D Secure return).

## Omise flow (`backend/app/routers/billing.py`, `app/billing/omise.py`)

1. `/billing` opens the OmiseCard form (omise.js), which returns a `tokn_...` token.
   Card numbers never reach our servers.
2. `POST /v1/billing/checkout` creates an Omise customer with that card and charges
   the first month.
   - If the charge comes back `successful`, the period starts and an Omise **schedule**
     is created to charge monthly on the billing day (clamped to day 1–28).
   - If it comes back `pending` with an `authorize_uri` (3-D Secure), the browser goes
     to the bank's page and returns to `/billing?omise_return=1`. That calls
     `POST /v1/billing/refresh`, which re-checks the charge.
3. Renewals arrive as `charge.complete` webhooks. Register this URL in the Omise
   dashboard:
   `https://<your-domain>/api/proxy/v1/billing/webhooks/omise`
   The handler re-fetches each event from the Omise API instead of trusting the POST
   body, and ignores event ids it has already processed.
4. Cancel stops the schedule, and the plan stays active until the period ends. A failed
   renewal sets the subscription to `past_due` with 3 days of grace.

The Omise calls follow the Omise API reference but haven't been run against test keys
yet. Try a full checkout, a 3-D Secure card, and a webhook with `skey_test_` /
`pkey_test_` keys before going live.
