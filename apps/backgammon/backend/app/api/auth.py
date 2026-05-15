"""FastAPI dependencies for JWT-based authentication."""

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Player
from app.services.auth_service import verify_token

# The tokenUrl is used by Swagger UI; the actual login route is /api/auth/login
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=True)
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_player(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Player:
    """Require a valid JWT and return the associated Player.

    Raises 401 if the token is missing, invalid, or the player no longer exists.
    """
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    player_id: str = payload.get("sub", "")
    if not player_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    player = await db.get(Player, player_id)
    if player is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Player not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return player


async def get_optional_player(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: AsyncSession = Depends(get_db),
) -> Optional[Player]:
    """Like ``get_current_player`` but returns ``None`` when no token is provided.

    Useful for endpoints that work both with and without auth.
    """
    if not token:
        return None

    payload = verify_token(token)
    if payload is None:
        return None

    player_id: str = payload.get("sub", "")
    if not player_id:
        return None

    return await db.get(Player, player_id)
