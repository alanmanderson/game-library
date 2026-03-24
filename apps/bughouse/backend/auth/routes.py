"""Auth API routes: register, login, Google OAuth, profile."""

from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import httpx

from auth.config import auth_settings
from auth.database import get_db
from auth.models import User
from auth.jwt_handler import create_access_token
from auth.dependencies import get_optional_user
from models import RegisterRequest, LoginRequest, AuthResponse, UserInfo, UpdateDisplayNameRequest

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter()


@router.post("/register", response_model=AuthResponse)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user with email and password."""
    # Check duplicate email
    result = await db.execute(select(User).where(User.email == request.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered.")

    user = User(
        email=request.email,
        display_name=request.display_name,
        hashed_password=pwd_context.hash(request.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id, user.display_name)
    return AuthResponse(
        access_token=token,
        user=UserInfo(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
        ),
    )


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Login with email and password."""
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not pwd_context.verify(request.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    token = create_access_token(user.id, user.display_name)
    return AuthResponse(
        access_token=token,
        user=UserInfo(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
        ),
    )


@router.get("/google")
async def google_login():
    """Redirect to Google OAuth consent screen."""
    if not auth_settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured.")

    params = urlencode({
        "client_id": auth_settings.google_client_id,
        "redirect_uri": auth_settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
async def google_callback(code: str, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback."""
    if not auth_settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured.")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": auth_settings.google_client_id,
                "client_secret": auth_settings.google_client_secret,
                "redirect_uri": auth_settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange code.")
        token_data = token_resp.json()

        # Fetch user info
        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch user info.")
        userinfo = userinfo_resp.json()

    google_id = userinfo["id"]
    email = userinfo.get("email", "")
    name = userinfo.get("name", email.split("@")[0])[:30]
    avatar = userinfo.get("picture")

    # Upsert user
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if user is None:
        # Check if email exists (link accounts)
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.google_id = google_id
            user.avatar_url = avatar
        else:
            user = User(
                email=email,
                display_name=name,
                google_id=google_id,
                avatar_url=avatar,
            )
            db.add(user)

    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    jwt_token = create_access_token(user.id, user.display_name)

    # Redirect to frontend with token in fragment
    return RedirectResponse(f"/#/auth/callback?token={jwt_token}")


@router.get("/me", response_model=UserInfo)
async def get_me(user: Optional[User] = Depends(get_optional_user)):
    """Get current user profile."""
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return UserInfo(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
    )


@router.patch("/me", response_model=UserInfo)
async def update_me(
    request: UpdateDisplayNameRequest,
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Update display name."""
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    user.display_name = request.display_name
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return UserInfo(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
    )
