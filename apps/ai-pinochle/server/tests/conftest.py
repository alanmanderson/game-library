import os
import sqlite3
import uuid
from datetime import datetime, timezone

# Set env vars BEFORE any app modules are imported
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests")

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import String, event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# ---------------------------------------------------------------------------
# SQLite/aiosqlite compatibility patch
#
# The test engine uses StaticPool with creator=lambda: _persistent_conn, which
# feeds a raw sqlite3.Connection (instead of an aiosqlite connection) to the
# aiosqlite dialect. This bypasses aiosqlite's cursor wrapping, so the cursor
# returned by SELECT text() queries is a sqlite3.Cursor instead of an
# AsyncAdapt_aiosqlite_cursor — the latter has _async_soft_close(), the former
# does not. SQLAlchemy 2.x's _ensure_sync_result calls _async_soft_close on the
# cursor after buffering results, which fails for raw sqlite3.Cursor.
#
# Patching the session module's local reference to _ensure_sync_result with a
# version that skips the async close for raw sqlite3.Cursor fixes SELECT text()
# queries in tests without affecting the production asyncpg path.
# ---------------------------------------------------------------------------
import sqlalchemy.ext.asyncio.result as _sa_async_result
import sqlalchemy.ext.asyncio.session as _sa_async_session

_original_ensure_sync_result = _sa_async_result._ensure_sync_result


async def _patched_ensure_sync_result(result, calling_method):  # type: ignore[no-untyped-def]
    try:
        if result._is_cursor and result.cursor is not None:
            if not hasattr(result.cursor, "_async_soft_close"):
                # Raw sqlite3.Cursor from StaticPool bypass — skip async close.
                return result
    except AttributeError:
        pass
    return await _original_ensure_sync_result(result, calling_method)


_sa_async_session._ensure_sync_result = _patched_ensure_sync_result

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
Game.__table__.c.version.server_default = None
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
    if "version" not in kwargs:
        target.version = 0


# Create ONE persistent sqlite3 connection that lives for the entire test run.
# This avoids aiosqlite's per-task connection lifecycle issues with TestClient.
_persistent_conn = sqlite3.connect(":memory:", check_same_thread=False)

engine = create_async_engine(
    "sqlite+aiosqlite://",
    echo=False,
    poolclass=StaticPool,
    creator=lambda: _persistent_conn,
)


_ANALYTICS_DDL = [
    """CREATE TABLE IF NOT EXISTS hands (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        hand_number INTEGER NOT NULL,
        winning_bidder_id TEXT,
        winning_bid_amount INTEGER,
        is_shoot_the_moon INTEGER NOT NULL DEFAULT 0,
        trump_suit TEXT,
        ns_meld_score INTEGER,
        ew_meld_score INTEGER,
        ns_trick_score INTEGER,
        ew_trick_score INTEGER,
        is_set INTEGER
    )""",
    """CREATE TABLE IF NOT EXISTS bids (
        id TEXT PRIMARY KEY,
        hand_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        bid_amount INTEGER,
        is_shoot_the_moon INTEGER NOT NULL DEFAULT 0,
        bid_sequence INTEGER NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS tricks (
        id TEXT PRIMARY KEY,
        hand_id TEXT NOT NULL,
        trick_number INTEGER NOT NULL,
        led_by_player_id TEXT,
        won_by_player_id TEXT,
        north_card TEXT,
        east_card TEXT,
        south_card TEXT,
        west_card TEXT,
        trick_points INTEGER
    )""",
]

_ANALYTICS_DROP = ["DROP TABLE IF EXISTS tricks", "DROP TABLE IF EXISTS bids", "DROP TABLE IF EXISTS hands"]


@pytest.fixture(autouse=True)
async def _setup_db():
    from app.api.auth import _login_attempts
    from app.websocket import background as bg
    from app.websocket.connection_manager import manager

    # Point the background task's session factory at the test engine.
    bg.set_session_factory(async_sessionmaker(engine, expire_on_commit=False))

    def _create_analytics(sync_conn):
        for ddl in _ANALYTICS_DDL:
            sync_conn.exec_driver_sql(ddl)

    def _drop_analytics(sync_conn):
        for stmt in _ANALYTICS_DROP:
            sync_conn.exec_driver_sql(stmt)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_create_analytics)
    yield
    manager.clear()
    manager.disconnect_times.clear()
    _login_attempts.clear()
    async with engine.begin() as conn:
        await conn.run_sync(_drop_analytics)
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
        try:
            yield db_session
            await db_session.commit()
        except Exception:
            await db_session.rollback()
            raise

    app.dependency_overrides[get_db] = _override_get_db

    # Allow WebSocket routes to reuse the test db session factory
    test_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    app.state._test_db_factory = test_session_factory

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
    del app.state._test_db_factory


@pytest.fixture
def sync_client(client: AsyncClient):
    """Sync TestClient for WebSocket tests.

    Depends on `client` to ensure app.state._test_db_factory is set
    before the TestClient's background thread starts.
    """
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
