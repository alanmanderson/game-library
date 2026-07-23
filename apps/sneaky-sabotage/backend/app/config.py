import os

from pydantic import BaseModel


class Settings(BaseModel):
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/sneaky_sabotage",
    )
    allowed_origins: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")


settings = Settings()
