"""JWT token creation and verification."""

from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from jwt import InvalidTokenError

from auth.config import auth_settings


def create_access_token(user_id: str, display_name: str) -> str:
    """Create a JWT access token."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=auth_settings.jwt_access_token_expire_minutes
    )
    payload = {
        "sub": user_id,
        "display_name": display_name,
        "exp": expire,
    }
    return jwt.encode(
        payload, auth_settings.jwt_secret_key, algorithm=auth_settings.jwt_algorithm
    )


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token. Returns payload or None."""
    try:
        payload = jwt.decode(
            token,
            auth_settings.jwt_secret_key,
            algorithms=[auth_settings.jwt_algorithm],
        )
        return payload
    except InvalidTokenError:
        return None
