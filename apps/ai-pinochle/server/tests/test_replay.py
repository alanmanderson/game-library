"""Tests for GET /games/{room_code}/replay endpoint."""
import base64
import json as _json
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game import Game
from app.models.user import User

pytestmark = pytest.mark.anyio


def _user_id_from_headers(auth_headers: dict) -> uuid.UUID:
    """Decode the JWT subject claim to get the requesting user's UUID."""
    token = auth_headers["Authorization"].removeprefix("Bearer ")
    payload_b64 = token.split(".")[1]
    # Add padding so base64 decode doesn't fail on odd-length strings
    payload = _json.loads(base64.b64decode(payload_b64 + "=="))
    return uuid.UUID(payload["sub"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _register(client: AsyncClient, email: str, first_name: str) -> dict[str, str]:
    """Register a user and return auth headers."""
    resp = await client.post(
        "/auth/register",
        json={
            "first_name": first_name,
            "last_name": "Player",
            "email": email,
            "password": "testpass123",
        },
    )
    assert resp.status_code in (200, 201), resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _seed_game(
    db: AsyncSession,
    status: str = "COMPLETED",
    north_player_id: uuid.UUID | None = None,
) -> Game:
    """Insert a minimal game row and return it.

    Pass `north_player_id` to pre-seat a player so the replay auth check passes.
    """
    game = Game(
        room_code="RPLY",
        status=status,
        current_state_json={"phase": "HAND_COMPLETE"},
        ns_total_score=150,
        ew_total_score=90,
        north_player_id=north_player_id,
    )
    db.add(game)
    await db.flush()
    return game


async def _seed_hand(db: AsyncSession, game_id: str, hand_number: int = 1, **kwargs) -> str:
    """Insert a hands row and return its id string."""
    hand_id = str(uuid.uuid4())
    params = {
        "id": hand_id,
        "game_id": game_id,
        "hand_number": hand_number,
        "winning_bidder_id": kwargs.get("winning_bidder_id"),
        "winning_bid_amount": kwargs.get("winning_bid_amount"),
        "is_shoot_the_moon": kwargs.get("is_shoot_the_moon", False),
        "trump_suit": kwargs.get("trump_suit"),
        "ns_meld_score": kwargs.get("ns_meld_score"),
        "ew_meld_score": kwargs.get("ew_meld_score"),
        "ns_trick_score": kwargs.get("ns_trick_score"),
        "ew_trick_score": kwargs.get("ew_trick_score"),
        "is_set": kwargs.get("is_set"),
    }
    await db.execute(
        text(
            "INSERT INTO hands (id, game_id, hand_number, winning_bidder_id, "
            "winning_bid_amount, is_shoot_the_moon, trump_suit, ns_meld_score, "
            "ew_meld_score, ns_trick_score, ew_trick_score, is_set) VALUES "
            "(:id, :game_id, :hand_number, :winning_bidder_id, :winning_bid_amount, "
            ":is_shoot_the_moon, :trump_suit, :ns_meld_score, :ew_meld_score, "
            ":ns_trick_score, :ew_trick_score, :is_set)"
        ),
        params,
    )
    return hand_id


async def _seed_bid(
    db: AsyncSession,
    hand_id: str,
    player_id: str,
    bid_amount: int | None,
    sequence: int,
    is_shoot_the_moon: bool = False,
) -> None:
    await db.execute(
        text(
            "INSERT INTO bids (id, hand_id, player_id, bid_amount, "
            "is_shoot_the_moon, bid_sequence) VALUES "
            "(:id, :hand_id, :player_id, :bid_amount, :is_stm, :seq)"
        ),
        {
            "id": str(uuid.uuid4()),
            "hand_id": hand_id,
            "player_id": player_id,
            "bid_amount": bid_amount,
            "is_stm": is_shoot_the_moon,
            "seq": sequence,
        },
    )


async def _seed_trick(
    db: AsyncSession,
    hand_id: str,
    trick_number: int,
    led_by: str | None = None,
    won_by: str | None = None,
    north_card: str | None = None,
    east_card: str | None = None,
    south_card: str | None = None,
    west_card: str | None = None,
    trick_points: int | None = None,
) -> None:
    await db.execute(
        text(
            "INSERT INTO tricks (id, hand_id, trick_number, led_by_player_id, "
            "won_by_player_id, north_card, east_card, south_card, west_card, "
            "trick_points) VALUES "
            "(:id, :hand_id, :trick_number, :led_by, :won_by, "
            ":north, :east, :south, :west, :points)"
        ),
        {
            "id": str(uuid.uuid4()),
            "hand_id": hand_id,
            "trick_number": trick_number,
            "led_by": led_by,
            "won_by": won_by,
            "north": north_card,
            "east": east_card,
            "south": south_card,
            "west": west_card,
            "points": trick_points,
        },
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_replay_empty_game(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    """A game with no hands yet returns hands: [] with correct top-level fields."""
    game = await _seed_game(db_session, north_player_id=_user_id_from_headers(auth_headers))
    await db_session.commit()

    resp = await client.get(f"/games/{game.room_code}/replay", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["room_code"] == game.room_code
    assert data["status"] == "COMPLETED"
    assert data["final_scores"] == {"ns": 150, "ew": 90}
    assert data["hands"] == []
    assert set(data["players"].keys()) == {"north", "east", "south", "west"}
    # north is seated (the auth user); other seats are empty
    assert data["players"]["north"] is not None
    assert all(data["players"][s] is None for s in ("east", "south", "west"))


async def test_replay_404(client: AsyncClient, auth_headers: dict):
    """Unknown room_code returns 404."""
    resp = await client.get("/games/ZZZZ/replay", headers=auth_headers)
    assert resp.status_code == 404


async def test_replay_unauthenticated(client: AsyncClient, db_session: AsyncSession):
    """Missing auth token returns 401."""
    game = await _seed_game(db_session)
    await db_session.commit()

    resp = await client.get(f"/games/{game.room_code}/replay")
    assert resp.status_code == 401


async def test_replay_forbidden_non_player(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    """A player not seated in the game gets 403."""
    # Seed a game where the auth user is NOT a seated player
    game = await _seed_game(db_session)
    await db_session.commit()

    resp = await client.get(f"/games/{game.room_code}/replay", headers=auth_headers)
    assert resp.status_code == 403


async def test_replay_with_hands(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    """Seed 1 hand with 2 bids and 2 tricks; verify full structure is returned."""
    user_id = _user_id_from_headers(auth_headers)
    game = await _seed_game(db_session, north_player_id=user_id)
    player_id = str(uuid.uuid4())

    hand_id = await _seed_hand(
        db_session,
        game_id=str(game.id),
        hand_number=1,
        winning_bid_amount=25,
        is_shoot_the_moon=False,
        trump_suit="HEARTS",
        ns_meld_score=30,
        ew_meld_score=20,
        ns_trick_score=40,
        ew_trick_score=10,
        is_set=False,
    )

    await _seed_bid(db_session, hand_id, player_id, bid_amount=25, sequence=1)
    await _seed_bid(db_session, hand_id, player_id, bid_amount=None, sequence=2)

    await _seed_trick(
        db_session,
        hand_id,
        trick_number=1,
        north_card="AH",
        east_card="KH",
        south_card="QH",
        west_card="JH",
        trick_points=10,
    )
    await _seed_trick(
        db_session,
        hand_id,
        trick_number=2,
        north_card="AS",
        east_card="KS",
        south_card="QS",
        west_card="JS",
        trick_points=5,
    )
    await db_session.commit()

    resp = await client.get(f"/games/{game.room_code}/replay", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()

    assert len(data["hands"]) == 1
    hand = data["hands"][0]
    assert hand["hand_number"] == 1
    assert hand["winning_bid_amount"] == 25
    assert hand["is_shoot_the_moon"] is False
    assert hand["trump_suit"] == "HEARTS"
    assert hand["ns_meld_score"] == 30
    assert hand["ew_meld_score"] == 20
    assert hand["ns_trick_score"] == 40
    assert hand["ew_trick_score"] == 10
    assert hand["is_set"] is False

    assert len(hand["bids"]) == 2
    assert hand["bids"][0]["bid_amount"] == 25
    assert hand["bids"][0]["is_shoot_the_moon"] is False
    assert hand["bids"][1]["bid_amount"] is None  # pass

    assert len(hand["tricks"]) == 2
    t1 = hand["tricks"][0]
    assert t1["trick_number"] == 1
    assert t1["cards"]["north"] == "AH"
    assert t1["cards"]["east"] == "KH"
    assert t1["cards"]["south"] == "QH"
    assert t1["cards"]["west"] == "JH"
    assert t1["trick_points"] == 10

    t2 = hand["tricks"][1]
    assert t2["trick_number"] == 2
    assert t2["trick_points"] == 5


async def test_replay_resolves_seats(
    client: AsyncClient, db_session: AsyncSession
):
    """Bids and tricks reference seat names, not raw UUIDs; player names resolved."""
    # Register four players
    north_headers = await _register(client, "north@example.com", "North")
    east_headers = await _register(client, "east@example.com", "East")
    south_headers = await _register(client, "south@example.com", "South")
    west_headers = await _register(client, "west@example.com", "West")

    # Look up their UUIDs from the DB
    async def _get_user_id(email: str) -> uuid.UUID:
        from sqlalchemy import select
        row = await db_session.execute(
            select(User).where(User.email == email)
        )
        return row.scalar_one().id

    north_id = await _get_user_id("north@example.com")
    east_id = await _get_user_id("east@example.com")
    south_id = await _get_user_id("south@example.com")
    west_id = await _get_user_id("west@example.com")

    # Build game with all four seats filled
    game = Game(
        room_code="SEAT",
        status="COMPLETED",
        current_state_json={"phase": "HAND_COMPLETE"},
        ns_total_score=200,
        ew_total_score=100,
        north_player_id=north_id,
        east_player_id=east_id,
        south_player_id=south_id,
        west_player_id=west_id,
    )
    db_session.add(game)
    await db_session.flush()

    hand_id = await _seed_hand(
        db_session,
        game_id=str(game.id),
        hand_number=1,
        winning_bidder_id=str(north_id),
        winning_bid_amount=30,
        trump_suit="SPADES",
        ns_meld_score=25,
        ew_meld_score=15,
        ns_trick_score=50,
        ew_trick_score=0,
        is_set=False,
    )

    # North bids 30, others pass
    await _seed_bid(db_session, hand_id, str(north_id), bid_amount=30, sequence=1)
    await _seed_bid(db_session, hand_id, str(east_id), bid_amount=None, sequence=2)
    await _seed_bid(db_session, hand_id, str(south_id), bid_amount=None, sequence=3)
    await _seed_bid(db_session, hand_id, str(west_id), bid_amount=None, sequence=4)

    # One trick: north led, north won
    await _seed_trick(
        db_session,
        hand_id,
        trick_number=1,
        led_by=str(north_id),
        won_by=str(north_id),
        north_card="AS",
        east_card="KS",
        south_card="QS",
        west_card="JS",
        trick_points=10,
    )
    await db_session.commit()

    resp = await client.get("/games/SEAT/replay", headers=north_headers)
    assert resp.status_code == 200
    data = resp.json()

    # Players dict should contain first names keyed by seat
    assert data["players"]["north"] == "North"
    assert data["players"]["east"] == "East"
    assert data["players"]["south"] == "South"
    assert data["players"]["west"] == "West"

    hand = data["hands"][0]
    assert hand["winning_bidder_seat"] == "north"

    # All bids should have seat names
    bid_seats = [b["seat"] for b in hand["bids"]]
    assert bid_seats == ["north", "east", "south", "west"]

    # Trick led_by_seat and won_by_seat should be "north"
    trick = hand["tricks"][0]
    assert trick["led_by_seat"] == "north"
    assert trick["won_by_seat"] == "north"


async def test_replay_in_progress_game(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    """Replay works for IN_PROGRESS games — returns whatever hands exist so far."""
    user_id = _user_id_from_headers(auth_headers)
    game = await _seed_game(db_session, status="IN_PROGRESS", north_player_id=user_id)

    hand_id = await _seed_hand(
        db_session,
        game_id=str(game.id),
        hand_number=1,
        trump_suit="CLUBS",
    )
    await db_session.commit()

    resp = await client.get(f"/games/{game.room_code}/replay", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "IN_PROGRESS"
    assert len(data["hands"]) == 1
    assert data["hands"][0]["trump_suit"] == "CLUBS"


async def test_replay_is_set_none_when_null(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    """is_set is None when the hand has not been scored yet."""
    game = await _seed_game(db_session, north_player_id=_user_id_from_headers(auth_headers))
    await _seed_hand(db_session, game_id=str(game.id), hand_number=1)
    await db_session.commit()

    resp = await client.get(f"/games/{game.room_code}/replay", headers=auth_headers)
    assert resp.status_code == 200
    hand = resp.json()["hands"][0]
    assert hand["is_set"] is None


async def test_replay_multiple_hands_ordered(
    client: AsyncClient, auth_headers: dict, db_session: AsyncSession
):
    """Multiple hands are returned in hand_number order."""
    game = await _seed_game(db_session, north_player_id=_user_id_from_headers(auth_headers))
    game_id = str(game.id)

    # Insert out of order to verify sorting
    await _seed_hand(db_session, game_id=game_id, hand_number=3, trump_suit="HEARTS")
    await _seed_hand(db_session, game_id=game_id, hand_number=1, trump_suit="CLUBS")
    await _seed_hand(db_session, game_id=game_id, hand_number=2, trump_suit="DIAMONDS")
    await db_session.commit()

    resp = await client.get(f"/games/{game.room_code}/replay", headers=auth_headers)
    assert resp.status_code == 200
    hands = resp.json()["hands"]
    assert len(hands) == 3
    assert [h["hand_number"] for h in hands] == [1, 2, 3]
    assert [h["trump_suit"] for h in hands] == ["CLUBS", "DIAMONDS", "HEARTS"]
