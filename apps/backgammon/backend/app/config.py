import os
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
    jwt_secret: str = os.getenv("JWT_SECRET", "")
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    # CORS
    allowed_origins: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")

    # Google OAuth (optional -- empty string means disabled)
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")


settings = Settings()

if not settings.jwt_secret:
    raise ValueError("JWT_SECRET environment variable is required")
