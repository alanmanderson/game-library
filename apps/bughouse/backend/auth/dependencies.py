"""FastAPI auth dependencies."""

from typing import Optional

from fastapi import Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.jwt_handler import decode_access_token
from auth.database import async_session_factory
from auth.models import User


async def get_optional_user(
    authorization: Optional[str] = Header(None),
) -> Optional[User]:
    """
    Extract user from Authorization header if present.
    Returns None for guests (no 401 raised).
    """
    if not authorization:
        return None

    # Expect "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    payload = decode_access_token(parts[1])
    if payload is None:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    async with async_session_factory() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            return None
        return user
