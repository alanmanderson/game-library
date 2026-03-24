import os
import uuid
from datetime import datetime, timezone

# Set env vars BEFORE any app modules are imported
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests")

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import String, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.base import Base
from app.models.game import Game
from app.models.user import User


# Patch User model column defaults for SQLite compatibility
User.__table__.c.id.server_default = None
User.__table__.c.id.default = None
User.__table__.c.created_at.server_default = None
User.__table__.c.created_at.default = None
User.__table__.c.updated_at.server_default = None
User.__table__.c.updated_at.default = None

# Patch Game model column defaults and enum type for SQLite compatibility
Game.__table__.c.id.server_default = None
Game.__table__.c.id.default = None
Game.__table__.c.ns_total_score.server_default = None
Game.__table__.c.ew_total_score.server_default = None
Game.__table__.c.status.type = String()


@event.listens_for(User, "init")
def _set_user_defaults(target, args, kwargs):
    if "id" not in kwargs:
        target.id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    if "created_at" not in kwargs:
        target.created_at = now
    if "updated_at" not in kwargs:
        target.updated_at = now


@event.listens_for(Game, "init")
def _set_game_defaults(target, args, kwargs):
    if "id" not in kwargs:
        target.id = uuid.uuid4()
    if "ns_total_score" not in kwargs:
        target.ns_total_score = 0
    if "ew_total_score" not in kwargs:
        target.ew_total_score = 0


engine = create_async_engine("sqlite+aiosqlite://", echo=False)


@pytest.fixture(autouse=True)
async def _setup_db():
    from app.api.auth import _login_attempts
    from app.websocket.connection_manager import manager

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    manager.clear()
    _login_attempts.clear()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session():
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        yield session


@pytest.fixture
async def client(db_session: AsyncSession):
    from app.database import get_db
    from app.main import app

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    # Allow WebSocket routes to reuse the test db session
    test_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    app.state._test_db_factory = test_session_factory

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
    del app.state._test_db_factory


@pytest.fixture
def sync_client():
    from app.main import app
    from starlette.testclient import TestClient

    with TestClient(app) as tc:
        yield tc


@pytest.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    resp = await client.post(
        "/auth/register",
        json={"first_name": "Test", "last_name": "User", "email": "test@example.com", "password": "securepass123"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
