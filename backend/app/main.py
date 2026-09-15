from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import create_indexes, get_database
from app.routers import auth, health, sessions, telemetry, users
from app.seed import seed_demo_users


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_indexes()
    await seed_demo_users(get_database())
    yield


app = FastAPI(title="cyberpump-backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(telemetry.router)
app.include_router(sessions.router)
app.include_router(health.router)
