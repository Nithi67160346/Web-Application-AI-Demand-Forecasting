from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit, unquote
from pydantic import model_validator

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Demandly API"
    database_url: str = "postgresql+psycopg://demandly:demandly@db:5432/demandly"
    jwt_secret_key: str = "change-this-secret-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    cors_origins: str = "http://localhost:3000,http://localhost:5173"
    auth_rate_limit: int = 120
    deployment_mode: Literal['development', 'production'] = 'development'

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    @model_validator(mode='after')
    def production_secrets(self):
        if self.deployment_mode == 'production':
            if len(self.jwt_secret_key) < 32 or any(word in self.jwt_secret_key.lower() for word in ('replace', 'change-this', 'test-secret')):
                raise ValueError('Production requires a new random JWT secret of at least 32 characters.')
            password = unquote(urlsplit(self.database_url).password or '')
            if len(password) < 24 or 'replace' in password.lower():
                raise ValueError('Production requires a new database password of at least 24 characters.')
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
