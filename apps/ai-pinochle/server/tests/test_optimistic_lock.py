"""Optimistic concurrency tests on the games.version column."""
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game import Game
from app.websocket.state_io import OptimisticLockError, save_game_state

pytestmark = pytest.mark.anyio


async def _make_game(db: AsyncSession) -> Game:
    game = Game(
        room_code="LOCK",
        status="IN_PROGRESS",
        current_state_json={"phase": "BIDDING"},
    )
    db.add(game)
    await db.flush()
    return game


async def test_save_increments_version_and_persists(db_session: AsyncSession):
    game = await _make_game(db_session)
    assert game.version == 0

    await save_game_state(db_session, game, {"phase": "BIDDING", "tick": 1})
    assert game.version == 1

    row = (await db_session.execute(select(Game).where(Game.id == game.id))).scalar_one()
    assert row.version == 1
    assert row.current_state_json["tick"] == 1


async def test_concurrent_writers_only_one_wins(db_session: AsyncSession):
    """Two writers loaded the same version; only the first save succeeds."""
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from tests.conftest import engine

    game = await _make_game(db_session)
    await db_session.commit()
    expected_version = game.version

    # Writer A — separate session, commits first.
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db_a:
        result = await db_a.execute(select(Game).where(Game.id == game.id))
        game_a = result.scalar_one()
        await save_game_state(db_a, game_a, {"phase": "FROM_A"})
        await db_a.commit()

    # Writer B — uses the original snapshot (stale version) and must fail.
    game.version = expected_version
    with pytest.raises(OptimisticLockError):
        await save_game_state(db_session, game, {"phase": "FROM_B"})

    # Verify A's write survives, B's was rejected.
    async with Session() as db_check:
        row = (
            await db_check.execute(select(Game).where(Game.id == game.id))
        ).scalar_one()
        assert row.current_state_json == {"phase": "FROM_A"}
        assert row.version == expected_version + 1


async def test_save_with_extra_columns(db_session: AsyncSession):
    game = await _make_game(db_session)
    await save_game_state(
        db_session, game, {"phase": "GAME_OVER"}, extra={"status": "COMPLETED"}
    )

    row = (
        await db_session.execute(select(Game).where(Game.id == game.id))
    ).scalar_one()
    assert row.status == "COMPLETED"
    assert row.version == 1
