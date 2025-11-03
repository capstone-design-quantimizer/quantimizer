from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    app_name: str = "QuantiMizer"
    database_url: str = Field(
        default="postgresql+psycopg2://quantimizer:quantimizer@localhost:5432/quantimizer",
        env="DATABASE_URL",
    )
    jwt_secret_key: str = Field(default="change-me", env="JWT_SECRET_KEY")
    jwt_algorithm: str = "HS256"
    access_token_expires_minutes: int = Field(default=15, env="ACCESS_TOKEN_EXPIRES")
    refresh_token_expires_minutes: int = Field(default=60 * 24 * 7, env="REFRESH_TOKEN_EXPIRES")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()