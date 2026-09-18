#!/usr/bin/env bash
# Starts the backend for local development: MongoDB via Docker Compose,
# then the FastAPI API in the foreground with --reload on port 9000.
set -euo pipefail


poetry run uvicorn app.main:app --reload --port 9000
