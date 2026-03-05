import os
import secrets
from pydantic import BaseModel


class Settings(BaseModel):
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://backgammon:backgammon_secret@localhost:5432/backgammon",
    )
    database_url_sync: str = os.getenv(
        "DATABASE_URL_SYNC",
        "postgresql://backgammon:backgammon_secret@localhost:5432/backgammon",
    )

    # JWT / Auth settings
    jwt_secret: str = os.getenv("JWT_SECRET", secrets.token_urlsafe(32))
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    # Google OAuth (optional -- empty string means disabled)
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")


settings = Settings()
