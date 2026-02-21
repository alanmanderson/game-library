import re

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game import Game


pytestmark = pytest.mark.anyio


async def test_create_game_201(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/games/create", headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert "room_code" in data


async def test_create_game_room_code_format(client: AsyncClient, auth_headers: dict):
    resp = await client.post("/games/create", headers=auth_headers)
    code = resp.json()["room_code"]
    assert re.fullmatch(r"[A-Z]{4}", code)


async def test_create_game_unauthenticated_401(client: AsyncClient):
    resp = await client.post("/games/create")
    assert resp.status_code == 401


async def test_create_game_invalid_token_401(client: AsyncClient):
    resp = await client.post(
        "/games/create", headers={"Authorization": "Bearer invalid.token.here"}
    )
    assert resp.status_code == 401


async def test_create_game_persisted(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    resp = await client.post("/games/create", headers=auth_headers)
    code = resp.json()["room_code"]

    result = await db_session.execute(select(Game).where(Game.room_code == code))
    game = result.scalar_one()
    assert game.status == "IN_PROGRESS"
    assert game.north_player_id is None
    assert game.east_player_id is None
    assert game.south_player_id is None
    assert game.west_player_id is None


async def test_create_game_initial_state_json(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    resp = await client.post("/games/create", headers=auth_headers)
    code = resp.json()["room_code"]

    result = await db_session.execute(select(Game).where(Game.room_code == code))
    game = result.scalar_one()
    assert game.current_state_json["phase"] == "LOBBY_WAITING"
    assert game.current_state_json["room_code"] == code


async def test_create_multiple_games_unique_codes(
    client: AsyncClient, auth_headers: dict
):
    resp1 = await client.post("/games/create", headers=auth_headers)
    resp2 = await client.post("/games/create", headers=auth_headers)
    assert resp1.json()["room_code"] != resp2.json()["room_code"]
