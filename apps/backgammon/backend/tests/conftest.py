"""Shared test fixtures for the backgammon backend test suite.

Provides an in-memory SQLite database, a FastAPI test client backed by httpx,
and convenience helpers for creating players and tables.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.database import Base, get_db
from app.main import app
from app.services.game_service import game_manager

# ---------------------------------------------------------------------------
# In-memory SQLite engine (async via aiosqlite)
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def db_session():
    """Create a fresh in-memory SQLite database for each test.

    Yields an ``AsyncSession`` that is also wired into the FastAPI dependency
    override so that route handlers use the same session.
    """
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    """Provide an ``httpx.AsyncClient`` pointed at the FastAPI app.

    The real ``get_db`` dependency is overridden so every request shares the
    same ``db_session`` (and therefore the same in-memory database).
    """

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()

    # Clean up any in-memory engines that may have been created during tests
    game_manager._engines.clear()
    game_manager._player_colors.clear()


# ---------------------------------------------------------------------------
# Convenience helpers
# ---------------------------------------------------------------------------


async def create_test_player(client: AsyncClient, nickname: str = "TestPlayer") -> dict:
    """Register a player via the API and return the response JSON."""
    resp = await client.post("/api/players", json={"nickname": nickname})
    assert resp.status_code == 200, f"Failed to create player: {resp.text}"
    return resp.json()


async def create_test_table(client: AsyncClient, player_id: str) -> dict:
    """Create a table via the API and return the response JSON."""
    resp = await client.post("/api/tables", json={"player_id": player_id})
    assert resp.status_code == 200, f"Failed to create table: {resp.text}"
    return resp.json()


async def create_and_join_table(
    client: AsyncClient, creator_nickname: str = "Alice", joiner_nickname: str = "Bob"
) -> tuple[dict, dict, dict]:
    """Create two players, create a table, and have the second player join.

    Returns a tuple of ``(table_data, creator_data, joiner_data)``.
    """
    creator = await create_test_player(client, creator_nickname)
    joiner = await create_test_player(client, joiner_nickname)

    table = await create_test_table(client, creator["id"])

    resp = await client.post(
        f"/api/tables/{table['id']}/join", json={"player_id": joiner["id"]}
    )
    assert resp.status_code == 200, f"Failed to join table: {resp.text}"
    joined_table = resp.json()

    return joined_table, creator, joiner
