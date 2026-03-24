import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
import jwt
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory rate limiting (per IP)
# ---------------------------------------------------------------------------
_login_attempts: dict[str, list[float]] = defaultdict(list)
MAX_LOGIN_ATTEMPTS = 10
RATE_LIMIT_WINDOW = 60  # seconds


def _check_rate_limit(ip: str | None) -> bool:
    """Return True if the IP should be rate-limited."""
    if not ip:
        return False
    now = time.time()
    attempts = _login_attempts[ip]
    # Clean old attempts outside the window
    fresh = [t for t in attempts if now - t < RATE_LIMIT_WINDOW]
    if fresh:
        _login_attempts[ip] = fresh
    else:
        _login_attempts.pop(ip, None)
    if len(fresh) >= MAX_LOGIN_ATTEMPTS:
        return True
    _login_attempts.setdefault(ip, []).append(now)
    return False


class RegisterRequest(BaseModel):
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    token: str


class AuthResponse(BaseModel):
    id: uuid.UUID
    username: str
    first_name: str
    last_name: str
    email: str | None
    access_token: str
    token_type: str = "bearer"


def _create_access_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    if _check_rate_limit(request.client.host if request.client else None):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="too many requests, please try again later",
        )
    user = User(
        username=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        email=body.email,
        password_hash=bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode(),
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="email already taken"
        )

    access_token = _create_access_token(user.id)
    return AuthResponse(
        id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        access_token=access_token,
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    if _check_rate_limit(request.client.host if request.client else None):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="too many requests, please try again later",
        )
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None or user.password_hash is None or not bcrypt.checkpw(
        body.password.encode(), user.password_hash.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid email or password",
        )
    access_token = _create_access_token(user.id)
    return AuthResponse(
        id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        access_token=access_token,
    )


@router.post("/google", response_model=AuthResponse)
async def google_auth(body: GoogleAuthRequest, request: Request, db: AsyncSession = Depends(get_db)):
    if _check_rate_limit(request.client.host if request.client else None):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="too many requests, please try again later",
        )
    try:
        id_info = google_id_token.verify_oauth2_token(
            body.token,
            google_requests.Request(),
            settings.google_client_id,
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid Google token",
        )

    google_sub = id_info["sub"]
    email = id_info["email"]

    if not id_info.get("email_verified", False):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google email not verified",
        )

    given_name = id_info.get("given_name") or email.split("@")[0]
    family_name = id_info.get("family_name", "")

    result = await db.execute(
        select(User).where(User.google_auth_id == google_sub)
    )
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            username=email,
            first_name=given_name,
            last_name=family_name,
            email=email,
            google_auth_id=google_sub,
            password_hash=None,
        )
        db.add(user)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="email already taken",
            )

    access_token = _create_access_token(user.id)
    return AuthResponse(
        id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        access_token=access_token,
    )
