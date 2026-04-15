"""Disconnect-forfeit background sweep tests."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.game import Game
from app.models.user import User
from app.websocket import background as bg
from app.websocket.connection_manager import manager
from tests.conftest import _persistent_conn, engine

pytestmark = pytest.mark.anyio


async def _seed_in_progress_game() -> tuple[uuid.UUID, uuid.UUID, str]:
    """Create a game in TRICK_PLAYING phase with a NORTH player."""
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        north = User(username="north", first_name="North", last_name="P")
        south = User(username="south", first_name="South", last_name="P")
        east = User(username="east", first_name="East", last_name="P")
        west = User(username="west", first_name="West", last_name="P")
        db.add_all([north, south, east, west])
        await db.flush()

        game = Game(
            room_code="FRFT",
            status="IN_PROGRESS",
            north_player_id=north.id,
            south_player_id=south.id,
            east_player_id=east.id,
            west_player_id=west.id,
            current_state_json={
                "phase": "TRICK_PLAYING",
                "game_scores": {"NS": 50, "EW": 60},
                "current_hand": {"hand_number": 3},
            },
        )
        db.add(game)
        await db.flush()
        await db.commit()
        return game.id, north.id, game.room_code


async def test_forfeit_after_timeout(monkeypatch):
    """Player disconnected longer than the timeout → game forfeited to other team."""
    game_id, north_id, room_code = await _seed_in_progress_game()

    # Pretend NORTH disconnected 10 minutes ago.
    manager.disconnect_times[room_code] = {
        north_id: datetime.now(timezone.utc) - timedelta(minutes=10),
    }

    await bg._sweep_disconnects(datetime.now(timezone.utc), timeout=120)

    # Game should now be ABANDONED with phase=GAME_OVER, EW wins.
    cur = _persistent_conn.cursor()
    cur.execute(
        "SELECT status, current_state_json FROM games WHERE room_code = ?",
        (room_code,),
    )
    row = cur.fetchone()
    import json
    assert row[0] == "ABANDONED"
    state = json.loads(row[1]) if isinstance(row[1], str) else row[1]
    assert state["phase"] == "GAME_OVER"
    assert state["forfeit"]["forfeiting_team"] == "NS"
    assert state["forfeit"]["winning_team"] == "EW"

    # The disconnect entry should be cleared.
    assert room_code not in manager.disconnect_times


async def test_no_forfeit_within_timeout():
    """Player disconnected for less than the timeout is left alone."""
    game_id, north_id, room_code = await _seed_in_progress_game()

    manager.disconnect_times[room_code] = {
        north_id: datetime.now(timezone.utc) - timedelta(seconds=30),
    }

    await bg._sweep_disconnects(datetime.now(timezone.utc), timeout=120)

    cur = _persistent_conn.cursor()
    cur.execute("SELECT status FROM games WHERE room_code = ?", (room_code,))
    row = cur.fetchone()
    assert row[0] == "IN_PROGRESS"
    assert room_code in manager.disconnect_times


async def test_no_forfeit_in_lobby():
    """A LOBBY_WAITING game does not forfeit even after the timeout."""
    game_id, north_id, room_code = await _seed_in_progress_game()

    # Flip phase to LOBBY_WAITING.
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        game = (await db.execute(select(Game).where(Game.id == game_id))).scalar_one()
        new_state = dict(game.current_state_json or {})
        new_state["phase"] = "LOBBY_WAITING"
        await db.execute(
            update(Game).where(Game.id == game_id).values(
                current_state_json=new_state, version=game.version + 1
            )
        )
        await db.commit()

    manager.disconnect_times[room_code] = {
        north_id: datetime.now(timezone.utc) - timedelta(minutes=10),
    }

    await bg._sweep_disconnects(datetime.now(timezone.utc), timeout=120)

    cur = _persistent_conn.cursor()
    cur.execute("SELECT status FROM games WHERE room_code = ?", (room_code,))
    row = cur.fetchone()
    assert row[0] == "IN_PROGRESS"
    # Stale disconnect cleared because game isn't mid-hand.
    assert room_code not in manager.disconnect_times


def test_forfeit_timeout_env_default(monkeypatch):
    monkeypatch.delenv("DISCONNECT_FORFEIT_SECONDS", raising=False)
    assert bg._forfeit_timeout_seconds() == 120
    monkeypatch.setenv("DISCONNECT_FORFEIT_SECONDS", "5")
    assert bg._forfeit_timeout_seconds() == 5
    monkeypatch.setenv("DISCONNECT_FORFEIT_SECONDS", "garbage")
    assert bg._forfeit_timeout_seconds() == 120
