"""Authentication service: password hashing, JWT tokens, Google ID token verification."""

from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import httpx
import jwt

from app.config import settings

# ---------------------------------------------------------------------------
# Password hashing (using bcrypt directly for compatibility)
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    """Return a bcrypt hash of the given plaintext password."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a plaintext password against its bcrypt hash."""
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


# ---------------------------------------------------------------------------
# JWT tokens
# ---------------------------------------------------------------------------


def create_access_token(
    data: dict, expires_delta: Optional[timedelta] = None
) -> str:
    """Create a signed JWT containing *data* with an expiry claim."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_expire_minutes)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT.

    Returns the payload dict on success, or ``None`` if the token is invalid
    or expired.
    """
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except jwt.InvalidTokenError:
        return None


# ---------------------------------------------------------------------------
# Google OAuth ID-token verification
# ---------------------------------------------------------------------------


async def verify_google_token(id_token: str) -> Optional[dict]:
    """Verify a Google ID token via Google's tokeninfo endpoint.

    Returns a dict with at least ``sub``, ``email``, and ``name`` on success,
    or ``None`` if verification fails.
    """
    if not settings.google_client_id:
        return None

    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, timeout=10.0)
            if resp.status_code != 200:
                return None
            data = resp.json()
            # Verify the audience matches our client ID
            if data.get("aud") != settings.google_client_id:
                return None
            return data
        except (httpx.HTTPError, Exception):
            return None
