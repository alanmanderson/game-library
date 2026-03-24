import logging

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    secret_key: str
    allowed_origins: str = "http://localhost:3000"
    access_token_expire_minutes: int = 60 * 24  # 24 hours
    google_client_id: str = ""

    @model_validator(mode="after")
    def _warn_default_secret(self) -> "Settings":
        if self.secret_key == "dev-secret-key-change-in-production":
            logger.warning(
                "Using default SECRET_KEY — set a strong secret in production!"
            )
        return self


settings = Settings()
