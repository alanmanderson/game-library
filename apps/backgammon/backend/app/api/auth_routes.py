"""Authentication routes: register, login, Google OAuth, guest, and me."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Player
from app.schemas import (
    AuthResponse,
    GoogleAuthRequest,
    GuestRequest,
    LoginRequest,
    PlayerResponse,
    RegisterRequest,
)
from app.services.auth_service import (
    create_access_token,
    hash_password,
    verify_google_token,
    verify_password,
)
from app.api.auth import get_current_player

auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


def _build_auth_response(player: Player, token: str) -> dict:
    """Build a dict matching the AuthResponse schema."""
    return {
        "token": token,
        "player": {
            "id": player.id,
            "nickname": player.nickname,
            "created_at": player.created_at,
            "is_guest": player.is_guest,
            "auth_provider": player.auth_provider,
        },
    }


# ------------------------------------------------------------------
# Registration
# ------------------------------------------------------------------


@auth_router.post("/register", response_model=AuthResponse)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Create a new account with email, password, and nickname."""
    # Check for existing email
    result = await db.execute(select(Player).where(Player.email == data.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    player = Player(
        nickname=data.nickname,
        email=data.email,
        password_hash=hash_password(data.password),
        is_guest=False,
        auth_provider="local",
    )
    db.add(player)
    await db.flush()
    await db.refresh(player)

    token = create_access_token({"sub": player.id})
    return _build_auth_response(player, token)


# ------------------------------------------------------------------
# Login
# ------------------------------------------------------------------


@auth_router.post("/login", response_model=AuthResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with email and password; returns a JWT."""
    result = await db.execute(select(Player).where(Player.email == data.email))
    player = result.scalar_one_or_none()

    if not player or not player.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(data.password, player.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token({"sub": player.id})
    return _build_auth_response(player, token)


# ------------------------------------------------------------------
# Google OAuth
# ------------------------------------------------------------------


@auth_router.post("/google", response_model=AuthResponse)
async def google_auth(data: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Verify a Google ID token, create or find the user, and return a JWT."""
    google_data = await verify_google_token(data.id_token)
    if not google_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token or Google auth not configured",
        )

    google_sub = google_data.get("sub")
    email = google_data.get("email")
    name = data.nickname or google_data.get("name", "Google User")

    if not google_sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        )

    # Check if user already exists by google_id
    result = await db.execute(select(Player).where(Player.google_id == google_sub))
    player = result.scalar_one_or_none()

    if not player and email:
        # Check by email as well (user may have registered with email first)
        result = await db.execute(select(Player).where(Player.email == email))
        player = result.scalar_one_or_none()
        if player:
            # Link Google account to existing email-based account
            player.google_id = google_sub
            player.auth_provider = "google"

    if not player:
        # Create new user
        player = Player(
            nickname=name,
            email=email,
            google_id=google_sub,
            is_guest=False,
            auth_provider="google",
        )
        db.add(player)
        await db.flush()
        await db.refresh(player)

    token = create_access_token({"sub": player.id})
    return _build_auth_response(player, token)


# ------------------------------------------------------------------
# Guest
# ------------------------------------------------------------------


@auth_router.post("/guest", response_model=AuthResponse)
async def create_guest(data: GuestRequest, db: AsyncSession = Depends(get_db)):
    """Create a temporary guest player with a nickname. No account needed."""
    player = Player(
        nickname=data.nickname,
        is_guest=True,
        auth_provider="guest",
    )
    db.add(player)
    await db.flush()
    await db.refresh(player)

    token = create_access_token({"sub": player.id})
    return _build_auth_response(player, token)


# ------------------------------------------------------------------
# Current user
# ------------------------------------------------------------------


@auth_router.get("/me", response_model=PlayerResponse)
async def get_me(player: Player = Depends(get_current_player)):
    """Return the currently authenticated player from the JWT."""
    return player
