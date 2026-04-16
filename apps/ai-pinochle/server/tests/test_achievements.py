"""Tests for achievement evaluation, persistence, and REST endpoint."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.achievement import UserAchievement
from app.models.game import Game
from app.models.user import User
from app.persistence.achievements import (
    ACHIEVEMENTS,
    check_game_achievements,
    check_hand_achievements,
    get_user_achievements,
    try_unlock,
)

pytestmark = pytest.mark.anyio

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _make_user(db: AsyncSession, suffix: str = "") -> User:
    u = User(
        username=f"player{suffix}_{uuid.uuid4().hex[:6]}",
        first_name="Player",
        last_name=suffix or "One",
        email=f"player{suffix}_{uuid.uuid4().hex[:6]}@example.com",
    )
    db.add(u)
    await db.flush()
    return u


async def _make_game(
    db: AsyncSession,
    north: User,
    east: User,
    south: User,
    west: User,
    status: str = "IN_PROGRESS",
    state: dict | None = None,
) -> Game:
    g = Game(
        room_code=uuid.uuid4().hex[:6].upper(),
        status=status,
        north_player_id=north.id,
        east_player_id=east.id,
        south_player_id=south.id,
        west_player_id=west.id,
        current_state_json=state or {},
    )
    db.add(g)
    await db.flush()
    return g


# ---------------------------------------------------------------------------
# try_unlock
# ---------------------------------------------------------------------------


async def test_try_unlock_inserts_and_returns_achievement(db_session: AsyncSession):
    user = await _make_user(db_session, "a")
    result = await try_unlock(db_session, user.id, "pinochle")
    assert result is not None
    assert result["name"] == ACHIEVEMENTS["pinochle"]["name"]

    rows = (
        await db_session.execute(
            select(UserAchievement).where(UserAchievement.user_id == user.id)
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].achievement_key == "pinochle"


async def test_try_unlock_idempotent_returns_none_on_duplicate(db_session: AsyncSession):
    user = await _make_user(db_session, "b")
    first = await try_unlock(db_session, user.id, "first_win")
    assert first is not None

    second = await try_unlock(db_session, user.id, "first_win")
    assert second is None

    rows = (
        await db_session.execute(
            select(UserAchievement).where(UserAchievement.user_id == user.id)
        )
    ).scalars().all()
    assert len(rows) == 1


async def test_try_unlock_stores_game_id(db_session: AsyncSession):
    user = await _make_user(db_session, "c")
    game_id = uuid.uuid4()
    # Pass game_id without FK constraint check (SQLite, no FK enforcement by default).
    result = await try_unlock(db_session, user.id, "pinochle", game_id=game_id)
    assert result is not None

    row = (
        await db_session.execute(
            select(UserAchievement).where(
                UserAchievement.user_id == user.id,
                UserAchievement.achievement_key == "pinochle",
            )
        )
    ).scalar_one()
    assert row.game_id == game_id


# ---------------------------------------------------------------------------
# check_hand_achievements
# ---------------------------------------------------------------------------


async def _setup_four_players(db: AsyncSession):
    north = await _make_user(db, "N")
    east = await _make_user(db, "E")
    south = await _make_user(db, "S")
    west = await _make_user(db, "W")
    game = await _make_game(db, north, east, south, west)
    return game, north, east, south, west


async def test_check_hand_achievements_shoot_the_moon(db_session: AsyncSession):
    game, north, east, south, west = await _setup_four_players(db_session)

    state = {
        "current_hand": {
            "bidding": {"is_shoot_the_moon": True},
            "player_melds": {},
        }
    }
    sfx = {
        "bidding_team": "NS",
        "score_deltas": {"NS": 250, "EW": -250},
        "team_meld": {"NS": 20, "EW": 15},
    }

    results = await check_hand_achievements(db_session, game, state, sfx)
    achieved_keys = {r[1]["name"] for r in results}
    assert "Shoot the Moon" in achieved_keys
    # Both NS players get it.
    assert len(results) == 2


async def test_check_hand_achievements_set_the_bid(db_session: AsyncSession):
    game, north, east, south, west = await _setup_four_players(db_session)

    state = {
        "current_hand": {
            "bidding": {"is_shoot_the_moon": False},
            "player_melds": {},
        }
    }
    sfx = {
        "bidding_team": "NS",
        "score_deltas": {"NS": -25, "EW": 25},
        "team_meld": {"NS": 10, "EW": 10},
    }

    results = await check_hand_achievements(db_session, game, state, sfx)
    achieved_keys = {r[1]["name"] for r in results}
    # EW players get Set the Bid.
    assert "Set the Bid" in achieved_keys
    set_results = [r for r in results if r[1]["name"] == "Set the Bid"]
    assert len(set_results) == 2


async def test_check_hand_achievements_pinochle_meld(db_session: AsyncSession):
    game, north, east, south, west = await _setup_four_players(db_session)

    state = {
        "current_hand": {
            "bidding": {"is_shoot_the_moon": False},
            "player_melds": {
                "NORTH": {
                    "melds": [{"name": "Pinochle", "cards": ["JD", "QS"], "points": 4}],
                    "total": 4,
                },
                "EAST": {"melds": [], "total": 0},
                "SOUTH": {"melds": [], "total": 0},
                "WEST": {"melds": [], "total": 0},
            },
        }
    }
    sfx = {
        "bidding_team": "NS",
        "score_deltas": {"NS": 25, "EW": 0},
        "team_meld": {"NS": 4, "EW": 0},
    }

    results = await check_hand_achievements(db_session, game, state, sfx)
    pinochle_results = [r for r in results if r[1]["name"] == "Pinochle!"]
    assert len(pinochle_results) == 1
    # North player got it.
    assert pinochle_results[0][0] == north.id


async def test_check_hand_achievements_meld_sixty_plus(db_session: AsyncSession):
    game, north, east, south, west = await _setup_four_players(db_session)

    state = {
        "current_hand": {
            "bidding": {"is_shoot_the_moon": False},
            "player_melds": {},
        }
    }
    sfx = {
        "bidding_team": "NS",
        "score_deltas": {"NS": 30, "EW": 0},
        "team_meld": {"NS": 60, "EW": 20},
    }

    results = await check_hand_achievements(db_session, game, state, sfx)
    meld_results = [r for r in results if r[1]["name"] == "Meld Master"]
    assert len(meld_results) == 2  # Both NS players
    assert {r[0] for r in meld_results} == {north.id, south.id}


async def test_check_hand_achievements_meld_below_sixty_no_unlock(db_session: AsyncSession):
    game, north, east, south, west = await _setup_four_players(db_session)

    state = {"current_hand": {"bidding": {}, "player_melds": {}}}
    sfx = {
        "bidding_team": "NS",
        "score_deltas": {"NS": 20, "EW": 0},
        "team_meld": {"NS": 59, "EW": 20},
    }

    results = await check_hand_achievements(db_session, game, state, sfx)
    meld_results = [r for r in results if r[1]["name"] == "Meld Master"]
    assert len(meld_results) == 0


# ---------------------------------------------------------------------------
# check_game_achievements
# ---------------------------------------------------------------------------


async def test_check_game_achievements_first_win(db_session: AsyncSession):
    game, north, east, south, west = await _setup_four_players(db_session)
    game.status = "COMPLETED"
    state = {"winner_team": "NS"}

    results = await check_game_achievements(db_session, game, state)
    first_win_results = [r for r in results if r[1]["name"] == "First Victory"]
    assert len(first_win_results) == 2
    assert {r[0] for r in first_win_results} == {north.id, south.id}


async def test_check_game_achievements_first_win_idempotent(db_session: AsyncSession):
    game, north, east, south, west = await _setup_four_players(db_session)
    game.status = "COMPLETED"
    state = {"winner_team": "NS"}

    # First call — should unlock.
    results1 = await check_game_achievements(db_session, game, state)
    assert len([r for r in results1 if r[1]["name"] == "First Victory"]) == 2

    # Second call — already unlocked, nothing new.
    results2 = await check_game_achievements(db_session, game, state)
    assert len([r for r in results2 if r[1]["name"] == "First Victory"]) == 0


async def test_check_game_achievements_ten_wins(db_session: AsyncSession):
    game, north, east, south, west = await _setup_four_players(db_session)
    game.status = "COMPLETED"
    state = {"winner_team": "NS"}

    # Patch _count_wins to return 10 for north player.
    import app.persistence.achievements as ach_module

    original = ach_module._count_wins

    async def _mock_count_wins(db, user_id):
        if user_id == north.id or user_id == south.id:
            return 10
        return 0

    ach_module._count_wins = _mock_count_wins
    try:
        results = await check_game_achievements(db_session, game, state)
    finally:
        ach_module._count_wins = original

    ten_win_results = [r for r in results if r[1]["name"] == "Veteran"]
    assert len(ten_win_results) == 2


async def test_check_game_achievements_no_winner_returns_empty(db_session: AsyncSession):
    game, north, east, south, west = await _setup_four_players(db_session)
    state = {}  # No winner_team key.

    results = await check_game_achievements(db_session, game, state)
    assert results == []


# ---------------------------------------------------------------------------
# get_user_achievements
# ---------------------------------------------------------------------------


async def test_get_user_achievements_returns_all_with_metadata(db_session: AsyncSession):
    user = await _make_user(db_session, "meta")

    await try_unlock(db_session, user.id, "pinochle")
    await try_unlock(db_session, user.id, "first_win")

    achievements = await get_user_achievements(db_session, user.id)
    assert len(achievements) == 2
    keys = {a["achievement_key"] for a in achievements}
    assert keys == {"pinochle", "first_win"}
    for a in achievements:
        assert "name" in a
        assert "description" in a
        assert "rarity" in a
        assert "unlocked_at" in a


async def test_get_user_achievements_empty_for_new_user(db_session: AsyncSession):
    user = await _make_user(db_session, "empty")
    achievements = await get_user_achievements(db_session, user.id)
    assert achievements == []


# ---------------------------------------------------------------------------
# REST endpoint: GET /users/me/achievements
# ---------------------------------------------------------------------------


async def _register_and_get_token(client: AsyncClient, suffix: str = "") -> str:
    resp = await client.post(
        "/auth/register",
        json={
            "first_name": "Test",
            "last_name": "User",
            "email": f"achiever{suffix}_{uuid.uuid4().hex[:6]}@example.com",
            "password": "securepass123",
        },
    )
    assert resp.status_code == 201
    return resp.json()["access_token"]


async def test_get_my_achievements_returns_200_with_structure(client: AsyncClient):
    token = await _register_and_get_token(client, "A")
    resp = await client.get(
        "/users/me/achievements",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "total" in body
    assert "achievements" in body
    assert "catalog" in body
    assert body["total"] == 0
    assert body["achievements"] == []
    # Catalog should have all 7 entries.
    assert len(body["catalog"]) == len(ACHIEVEMENTS)
    for entry in body["catalog"]:
        assert "key" in entry
        assert "name" in entry
        assert "rarity" in entry


async def test_get_my_achievements_returns_4xx_without_auth(client: AsyncClient):
    # Missing Authorization header — FastAPI returns 401 or 403 depending on version.
    resp = await client.get("/users/me/achievements")
    assert resp.status_code in (401, 403)


async def test_get_my_achievements_reflects_unlocked(
    client: AsyncClient, db_session: AsyncSession
):
    token = await _register_and_get_token(client, "B")

    # Decode the user ID from the token to unlock an achievement directly.
    import jwt
    from app.config import settings

    payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    user_id = uuid.UUID(payload["sub"])

    await try_unlock(db_session, user_id, "pinochle")
    await db_session.commit()

    resp = await client.get(
        "/users/me/achievements",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["achievements"][0]["achievement_key"] == "pinochle"
    assert body["achievements"][0]["rarity"] == "COMMON"
