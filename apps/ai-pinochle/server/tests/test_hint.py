"""Tests for the GET /games/{room_code}/hint endpoint.

Covers hint responses for each game phase, auth requirements, and
the hints_enabled guard.
"""
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engine.deck import shuffle_and_deal
from app.engine.tricks import card_suit, get_legal_cards
from app.engine.meld import SUIT_LETTER
from app.models.game import Game


pytestmark = pytest.mark.anyio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_ai_game(client: AsyncClient, auth_headers: dict) -> str:
    """Create a vs-AI game and return its room code."""
    resp = await client.post(
        "/games/create-vs-ai",
        headers=auth_headers,
        json={"hints_enabled": True},
    )
    assert resp.status_code == 201
    return resp.json()["room_code"]


async def _set_game_state(
    db_session: AsyncSession, room_code: str, state_patch: dict
) -> Game:
    """Load a game by room_code and patch its current_state_json."""
    result = await db_session.execute(
        select(Game).where(Game.room_code == room_code)
    )
    game = result.scalar_one()
    merged = {**(game.current_state_json or {}), **state_patch}
    game.current_state_json = merged
    await db_session.flush()
    return game


# ---------------------------------------------------------------------------
# Phase-specific hint tests
# ---------------------------------------------------------------------------


async def test_hint_bidding(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    room_code = await _create_ai_game(client, auth_headers)

    deal = shuffle_and_deal()
    await _set_game_state(db_session, room_code, {
        "phase": "BIDDING",
        "hints_enabled": True,
        "player_hands": deal,
        "current_hand": {
            "bidding": {
                "winning_bid": None,
                "winning_seat": None,
                "next_to_act_seat": "SOUTH",
                "passed_seats": [],
            },
        },
    })

    resp = await client.get(f"/games/{room_code}/hint", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "BIDDING"
    assert data["suggestion"]["action"] in ("bid", "pass")
    assert "reason" in data["suggestion"]
    if data["suggestion"]["action"] == "bid":
        assert isinstance(data["suggestion"]["amount"], int)
    else:
        assert data["suggestion"]["amount"] is None


async def test_hint_naming_trump(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    room_code = await _create_ai_game(client, auth_headers)

    # Give the human a hand heavy in hearts so the hint is deterministic
    hand = ["AH", "AH", "KH", "QH", "JH", "10H", "9S", "9D", "9C", "9S", "9D", "9C"]
    await _set_game_state(db_session, room_code, {
        "phase": "NAMING_TRUMP",
        "hints_enabled": True,
        "player_hands": {"SOUTH": hand, "NORTH": [], "EAST": [], "WEST": []},
        "current_hand": {
            "bidding": {"winning_seat": "SOUTH"},
        },
    })

    resp = await client.get(f"/games/{room_code}/hint", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "NAMING_TRUMP"
    assert data["suggestion"]["suit"] == "HEARTS"
    assert "reason" in data["suggestion"]


async def test_hint_passing_cards(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    room_code = await _create_ai_game(client, auth_headers)

    hand = ["AH", "KH", "QH", "10H", "9S", "9D", "9C", "JS", "JD", "JC", "10S", "10D"]
    await _set_game_state(db_session, room_code, {
        "phase": "PASSING_CARDS",
        "hints_enabled": True,
        "player_hands": {"SOUTH": hand, "NORTH": [], "EAST": [], "WEST": []},
        "current_hand": {
            "trump_suit": "HEARTS",
            "card_passing": {
                "bidder_seat": "SOUTH",
                "partner_seat": "NORTH",
                "submitted": {},
            },
        },
    })

    resp = await client.get(f"/games/{room_code}/hint", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "PASSING_CARDS"
    assert len(data["suggestion"]["cards"]) == 3
    # All suggested cards should be from the player's hand
    for card in data["suggestion"]["cards"]:
        assert card in hand
    # Suggested cards should be non-trump when possible
    for card in data["suggestion"]["cards"]:
        assert card_suit(card) != "H"
    assert "reason" in data["suggestion"]


async def test_hint_trick_playing(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    room_code = await _create_ai_game(client, auth_headers)

    hand = ["AH", "KH", "9S", "9D"]
    await _set_game_state(db_session, room_code, {
        "phase": "TRICK_PLAYING",
        "hints_enabled": True,
        "player_hands": {"SOUTH": hand, "NORTH": [], "EAST": [], "WEST": []},
        "current_hand": {
            "trump_suit": "HEARTS",
            "trick_play": {
                "cards_played": [],
                "next_to_act_seat": "SOUTH",
            },
        },
    })

    resp = await client.get(f"/games/{room_code}/hint", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "TRICK_PLAYING"
    assert data["suggestion"]["card"] in hand
    assert "reason" in data["suggestion"]


async def test_hint_trick_playing_following_suit(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    """When following suit, the suggested card must be legal."""
    room_code = await _create_ai_game(client, auth_headers)

    hand = ["AH", "KH", "9S", "9D"]
    cards_played = [{"seat": "NORTH", "card": "QH"}]
    await _set_game_state(db_session, room_code, {
        "phase": "TRICK_PLAYING",
        "hints_enabled": True,
        "player_hands": {"SOUTH": hand, "NORTH": [], "EAST": [], "WEST": []},
        "current_hand": {
            "trump_suit": "SPADES",
            "trick_play": {
                "cards_played": cards_played,
                "next_to_act_seat": "SOUTH",
            },
        },
    })

    resp = await client.get(f"/games/{room_code}/hint", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    suggested = data["suggestion"]["card"]
    # Must follow hearts
    legal = get_legal_cards(hand, "H", "S", cards_played)
    assert suggested in legal


async def test_hint_showing_meld(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    room_code = await _create_ai_game(client, auth_headers)

    await _set_game_state(db_session, room_code, {
        "phase": "SHOWING_MELD",
        "hints_enabled": True,
        "player_hands": {"SOUTH": [], "NORTH": [], "EAST": [], "WEST": []},
        "current_hand": {},
    })

    resp = await client.get(f"/games/{room_code}/hint", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "SHOWING_MELD"
    assert data["suggestion"]["action"] == "acknowledge"


async def test_hint_hand_complete(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    room_code = await _create_ai_game(client, auth_headers)

    await _set_game_state(db_session, room_code, {
        "phase": "HAND_COMPLETE",
        "hints_enabled": True,
        "player_hands": {"SOUTH": [], "NORTH": [], "EAST": [], "WEST": []},
        "current_hand": {},
    })

    resp = await client.get(f"/games/{room_code}/hint", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["phase"] == "HAND_COMPLETE"
    assert data["suggestion"]["action"] == "acknowledge"


# ---------------------------------------------------------------------------
# Auth / guard tests
# ---------------------------------------------------------------------------


async def test_hint_requires_auth(client: AsyncClient, db_session: AsyncSession):
    resp = await client.get("/games/ABCD/hint")
    assert resp.status_code in (401, 403)


async def test_hint_requires_hints_enabled(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    # Create game with hints disabled
    resp = await client.post(
        "/games/create-vs-ai",
        headers=auth_headers,
        json={"hints_enabled": False},
    )
    assert resp.status_code == 201
    room_code = resp.json()["room_code"]

    resp = await client.get(f"/games/{room_code}/hint", headers=auth_headers)
    assert resp.status_code == 403
    assert "not enabled" in resp.json()["detail"].lower()


async def test_hint_game_not_found(client: AsyncClient, auth_headers: dict):
    resp = await client.get("/games/ZZZZ/hint", headers=auth_headers)
    assert resp.status_code == 404


async def test_create_vs_ai_hints_enabled_default(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    """Creating a vs-AI game without a body defaults hints_enabled to True."""
    resp = await client.post("/games/create-vs-ai", headers=auth_headers)
    assert resp.status_code == 201
    room_code = resp.json()["room_code"]

    result = await db_session.execute(
        select(Game).where(Game.room_code == room_code)
    )
    game = result.scalar_one()
    assert game.current_state_json["hints_enabled"] is True


async def test_create_vs_ai_hints_disabled(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    """Explicitly passing hints_enabled=false stores it in state."""
    resp = await client.post(
        "/games/create-vs-ai",
        headers=auth_headers,
        json={"hints_enabled": False},
    )
    assert resp.status_code == 201
    room_code = resp.json()["room_code"]

    result = await db_session.execute(
        select(Game).where(Game.room_code == room_code)
    )
    game = result.scalar_one()
    assert game.current_state_json["hints_enabled"] is False
