from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    MONGO_URI: str = "mongodb://localhost:27017/cyberpump"
    JWT_SECRET: str
    ACCESS_TTL_S: int = 600
    REFRESH_TTL_S: int = 604800
    TELEMETRY_SERVICE_TOKEN: str
    TELEMETRY_RETENTION_DAYS: int = 90

    # "disabled" rejects checkout, "mock" activates plans without charging (dev only),
    # "omise" charges through Omise with the keys below.
    BILLING_PROVIDER: Literal["disabled", "mock", "omise"] = "disabled"
    OMISE_PUBLIC_KEY: str = ""
    OMISE_SECRET_KEY: str = ""
    # Where Omise sends the user back after 3-D Secure (the frontend /billing page).
    APP_BASE_URL: str = "http://localhost:5173"


settings = Settings()
