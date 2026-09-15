from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    MONGO_URI: str = "mongodb://localhost:27017/cyberpump"
    JWT_SECRET: str
    ACCESS_TTL_S: int = 600
    REFRESH_TTL_S: int = 604800
    TELEMETRY_SERVICE_TOKEN: str
    TELEMETRY_RETENTION_DAYS: int = 90


settings = Settings()
