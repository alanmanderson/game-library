from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    secret_key: str
    allowed_origins: str = "http://localhost:3000"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    google_client_id: str = ""


settings = Settings()
