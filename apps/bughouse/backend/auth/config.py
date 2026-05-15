"""Auth configuration from environment variables."""

import os

from pydantic import model_validator
from pydantic_settings import BaseSettings

WEAK_JWT_SECRETS = frozenset({
    "dev-secret-change-in-production",
    "change-me-in-production",
})


class AuthSettings(BaseSettings):
    jwt_secret_key: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440  # 24 hours
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    database_url: str = "sqlite+aiosqlite:///./bughouse.db"
    environment: str = os.getenv("BUGHOUSE_ENV", "production")

    model_config = {"env_prefix": "BUGHOUSE_"}

    @model_validator(mode="after")
    def _reject_weak_jwt_secret(self) -> "AuthSettings":
        if (
            self.jwt_secret_key in WEAK_JWT_SECRETS
            and self.environment != "development"
        ):
            raise ValueError(
                f"JWT secret is a known weak default "
                f"({self.jwt_secret_key!r}). Set BUGHOUSE_JWT_SECRET_KEY "
                f"to a strong random value, or set BUGHOUSE_ENV="
                f"'development' to allow weak secrets in local dev."
            )
        return self


auth_settings = AuthSettings()
