# cyberpump backend

FastAPI backend for muscle-activity-analyzer. Implements the auth, user and
telemetry endpoints the SvelteKit frontend expects at `BACKEND_API_URL`
(default `http://localhost:9000`).

## Prerequisites

- Python 3.11+
- [Poetry](https://python-poetry.org/)
- Docker + Docker Compose (for MongoDB, and optionally for running the API itself)

## Setup

```bash
cd backend
poetry install
cp .env.example .env   # edit JWT_SECRET / TELEMETRY_SERVICE_TOKEN for anything beyond local dev
```

## Run MongoDB (and optionally the API) via Docker Compose

```bash
docker compose up -d mongo
```

To run the whole stack (API included) in Docker instead of locally:

```bash
docker compose up -d
```

## Run the API locally

```bash
poetry run uvicorn app.main:app --reload --port 9000
```

The frontend's `BACKEND_API_URL` should point at `http://localhost:9000`.

## Environment variables

See `.env.example`:

- `MONGO_URI` — Mongo connection string, database name in the path (default `mongodb://localhost:27017/cyberpump`)
- `JWT_SECRET` — required, signs access/refresh tokens
- `ACCESS_TTL_S` / `REFRESH_TTL_S` — token lifetimes in seconds
- `TELEMETRY_SERVICE_TOKEN` — shared secret the SvelteKit server sends as `X-Service-Token` when forwarding live telemetry to `POST /v1/telemetry`
- `TELEMETRY_RETENTION_DAYS` — TTL (in days) for stored telemetry samples

## Demo users

On startup the API seeds the same demo accounts used by the frontend's quick-select
login buttons (`frontend/src/lib/workout/user.svelte.ts` `PRESET_USERS`):

- `nont@cyberpump.io`
- `karn@cyberpump.io`
- `suphawit@cyberpump.io`

All demo accounts share the password **`cyberpump123`**.

## Notes on the auth contract

- `POST /v1/auth/refresh` takes **no request body** — the SvelteKit proxy
  (`frontend/src/routes/api/proxy/[...slug]/+server.ts`) sends the refresh
  token only as `Authorization: Bearer <refresh_token>`. Refresh tokens are
  rotated: each successful refresh revokes the old `jti` and issues a new pair.
- `POST /v1/telemetry` is a machine-to-machine ingest hop from the SvelteKit
  server (not a browser session), so it is authenticated with a shared
  `X-Service-Token` header instead of a user's bearer token.
