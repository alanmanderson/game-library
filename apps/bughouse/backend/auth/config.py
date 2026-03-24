"""Auth configuration from environment variables."""

from pydantic_settings import BaseSettings


class AuthSettings(BaseSettings):
    jwt_secret_key: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440  # 24 hours
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    database_url: str = "sqlite+aiosqlite:///./bughouse.db"

    model_config = {"env_prefix": "BUGHOUSE_"}


auth_settings = AuthSettings()
