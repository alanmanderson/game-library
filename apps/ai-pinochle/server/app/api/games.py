import random
import string
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.game import Game
from app.models.user import User

# Brute-force protection for room code joining.
# Maps user_id -> list of timestamps of failed join attempts.
_failed_join_attempts: dict[uuid.UUID, list[datetime]] = defaultdict(list)
_MAX_FAILED_JOINS = 5
_FAILED_JOIN_WINDOW_SECONDS = 60

router = APIRouter()


class CreateGameResponse(BaseModel):
    room_code: str


class JoinGameResponse(BaseModel):
    room_code: str
    game_id: uuid.UUID
    phase: str
    seats: dict[str, str | None]
    your_seat: str | None


def _generate_room_code() -> str:
    return "".join(random.choices(string.ascii_uppercase, k=4))


@router.post("/create", response_model=CreateGameResponse, status_code=status.HTTP_201_CREATED)
async def create_game(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for _ in range(10):
        code = _generate_room_code()
        game = Game(
            room_code=code,
            status="IN_PROGRESS",
            current_state_json={
                "room_code": code,
                "phase": "LOBBY_WAITING",
                "created_by": str(user.id),
            },
        )
        db.add(game)
        try:
            await db.flush()
            return CreateGameResponse(room_code=code)
        except IntegrityError:
            await db.rollback()

    # Extremely unlikely — all 10 attempts collided
    raise RuntimeError("failed to generate unique room code")


@router.post(
    "/create-vs-ai",
    response_model=CreateGameResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_vs_ai(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new game with the human at SOUTH and 3 bots filling the rest."""
    from app.bot.users import BOT_UUIDS, get_or_create_bots

    await get_or_create_bots(db)

    bot_seats = ["NORTH", "EAST", "WEST"]

    for _ in range(10):
        code = _generate_room_code()
        game = Game(
            room_code=code,
            status="IN_PROGRESS",
            current_state_json={
                "room_code": code,
                "phase": "LOBBY_WAITING",
                "created_by": str(user.id),
                "bot_seats": bot_seats,
            },
            south_player_id=user.id,
            north_player_id=BOT_UUIDS["NORTH"],
            east_player_id=BOT_UUIDS["EAST"],
            west_player_id=BOT_UUIDS["WEST"],
        )
        db.add(game)
        try:
            await db.flush()
            return CreateGameResponse(room_code=code)
        except IntegrityError:
            await db.rollback()

    raise RuntimeError("failed to generate unique room code")


SEAT_COLUMNS = ["north", "east", "south", "west"]


class GameSummaryResponse(BaseModel):
    room_code: str
    status: str
    phase: str
    ns_score: int
    ew_score: int
    players: dict[str, str | None]
    started_at: datetime | None
    ended_at: datetime | None


@router.get("/mine", response_model=list[GameSummaryResponse])
async def my_games(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Game).where(
            or_(
                Game.north_player_id == user.id,
                Game.east_player_id == user.id,
                Game.south_player_id == user.id,
                Game.west_player_id == user.id,
            )
        )
    )
    games = result.scalars().all()

    # Batch-fetch usernames for all players across all games
    all_player_ids: set[uuid.UUID] = set()
    for game in games:
        for seat in SEAT_COLUMNS:
            pid = getattr(game, f"{seat}_player_id")
            if pid is not None:
                all_player_ids.add(pid)

    id_to_name: dict[uuid.UUID, str] = {}
    if all_player_ids:
        rows = await db.execute(select(User).where(User.id.in_(all_player_ids)))
        for u in rows.scalars():
            id_to_name[u.id] = u.first_name

    summaries = []
    for game in games:
        phase = (game.current_state_json or {}).get("phase", "LOBBY_WAITING")
        players: dict[str, str | None] = {}
        for seat in SEAT_COLUMNS:
            pid = getattr(game, f"{seat}_player_id")
            players[seat] = id_to_name.get(pid) if pid else None

        summaries.append(GameSummaryResponse(
            room_code=game.room_code,
            status=game.status,
            phase=phase,
            ns_score=game.ns_total_score,
            ew_score=game.ew_total_score,
            players=players,
            started_at=game.started_at,
            ended_at=game.ended_at,
        ))

    # Sort: IN_PROGRESS first, then by most recent started_at
    epoch = datetime(2000, 1, 1)
    summaries.sort(
        key=lambda s: (
            0 if s.status == "IN_PROGRESS" else 1,
            -(s.started_at or epoch).timestamp(),
        ),
    )

    return summaries


@router.post("/{room_code}/join", response_model=JoinGameResponse)
async def join_game(
    room_code: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Brute-force protection: check recent failed attempts for this user
    now = datetime.now(timezone.utc)
    attempts = _failed_join_attempts[user.id]
    # Prune old attempts outside the window
    cutoff = now.timestamp() - _FAILED_JOIN_WINDOW_SECONDS
    fresh = [t for t in attempts if t.timestamp() > cutoff]
    if fresh:
        _failed_join_attempts[user.id] = fresh
    else:
        _failed_join_attempts.pop(user.id, None)
    attempts = fresh

    if len(attempts) >= _MAX_FAILED_JOINS:
        raise HTTPException(
            status_code=429,
            detail="Too many failed join attempts. Please wait before trying again.",
        )

    result = await db.execute(
        select(Game).where(Game.room_code == room_code, Game.status == "IN_PROGRESS")
    )
    game = result.scalar_one_or_none()
    if game is None:
        _failed_join_attempts[user.id].append(now)
        raise HTTPException(status_code=404, detail="Game not found")

    phase = (game.current_state_json or {}).get("phase", "LOBBY_WAITING")

    if phase != "LOBBY_WAITING":
        raise HTTPException(status_code=409, detail="Game already started")

    seats: dict[str, str | None] = {}
    player_ids = {
        seat: getattr(game, f"{seat}_player_id") for seat in SEAT_COLUMNS
    }

    # Batch-fetch first names for occupied seats
    occupied_ids = [pid for pid in player_ids.values() if pid is not None]
    id_to_name: dict[uuid.UUID, str] = {}
    if occupied_ids:
        rows = await db.execute(select(User).where(User.id.in_(occupied_ids)))
        for u in rows.scalars():
            id_to_name[u.id] = u.first_name

    your_seat: str | None = None
    for seat, pid in player_ids.items():
        seats[seat] = id_to_name.get(pid) if pid else None
        if pid == user.id:
            your_seat = seat

    return JoinGameResponse(
        room_code=game.room_code,
        game_id=game.id,
        phase=phase,
        seats=seats,
        your_seat=your_seat,
    )


# ---------------------------------------------------------------------------
# Replay endpoint — response models
# ---------------------------------------------------------------------------


class ReplayBid(BaseModel):
    seat: str
    bid_amount: int | None  # None = pass
    is_shoot_the_moon: bool


class ReplayTrick(BaseModel):
    trick_number: int
    led_by_seat: str | None
    won_by_seat: str | None
    cards: dict[str, str | None]  # {"north": "AH", "east": "KH", ...}
    trick_points: int | None


class ReplayHand(BaseModel):
    hand_number: int
    winning_bidder_seat: str | None
    winning_bid_amount: int | None
    is_shoot_the_moon: bool
    trump_suit: str | None  # uppercase e.g. "HEARTS", or None
    ns_meld_score: int | None
    ew_meld_score: int | None
    ns_trick_score: int | None
    ew_trick_score: int | None
    is_set: bool | None
    bids: list[ReplayBid]
    tricks: list[ReplayTrick]


class ReplayResponse(BaseModel):
    room_code: str
    status: str
    final_scores: dict[str, int]  # {"ns": 150, "ew": 90}
    players: dict[str, str | None]  # {"north": "Alice", ...}
    hands: list[ReplayHand]


# ---------------------------------------------------------------------------
# Replay endpoint
# ---------------------------------------------------------------------------


def _in_placeholders(ids: list[str]) -> tuple[str, dict[str, str]]:
    """Return (sql_fragment, params) for a cross-DB compatible IN clause.

    Example: ids=["a","b"] -> ("IN (:id0, :id1)", {"id0":"a","id1":"b"})
    """
    placeholders = ", ".join(f":id{i}" for i in range(len(ids)))
    params = {f"id{i}": hid for i, hid in enumerate(ids)}
    return f"IN ({placeholders})", params


@router.get("/{room_code}/replay", response_model=ReplayResponse)
async def get_game_replay(
    room_code: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Game).where(Game.room_code == room_code))
    game = result.scalar_one_or_none()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    # Only players who were seated at the table may view the replay.
    seat_player_ids = [
        getattr(game, f"{seat}_player_id") for seat in SEAT_COLUMNS
    ]
    if user.id not in seat_player_ids:
        raise HTTPException(status_code=403, detail="You were not a player in this game")

    # Build player UUID -> seat map
    player_id_to_seat: dict[str, str] = {}
    all_player_ids: list[uuid.UUID] = []
    for seat in SEAT_COLUMNS:
        pid = getattr(game, f"{seat}_player_id")
        if pid is not None:
            player_id_to_seat[str(pid)] = seat
            all_player_ids.append(pid)

    # Batch-fetch player first names
    id_to_name: dict[str, str] = {}
    if all_player_ids:
        rows = await db.execute(select(User).where(User.id.in_(all_player_ids)))
        for u in rows.scalars():
            id_to_name[str(u.id)] = u.first_name

    players: dict[str, str | None] = {seat: None for seat in SEAT_COLUMNS}
    for pid_str, seat in player_id_to_seat.items():
        players[seat] = id_to_name.get(pid_str)

    # Load all hands for this game ordered by hand_number
    hands_result = await db.execute(
        text(
            "SELECT id, hand_number, winning_bidder_id, winning_bid_amount, "
            "is_shoot_the_moon, trump_suit, ns_meld_score, ew_meld_score, "
            "ns_trick_score, ew_trick_score, is_set "
            "FROM hands WHERE game_id = :game_id ORDER BY hand_number"
        ),
        {"game_id": str(game.id)},
    )
    hand_rows = hands_result.mappings().all()

    replay_hands: list[ReplayHand] = []

    if hand_rows:
        hand_ids = [str(h["id"]) for h in hand_rows]
        in_clause, in_params = _in_placeholders(hand_ids)

        # Load all bids for these hands in one query
        bids_result = await db.execute(
            text(
                f"SELECT hand_id, player_id, bid_amount, is_shoot_the_moon, bid_sequence "
                f"FROM bids WHERE hand_id {in_clause} ORDER BY hand_id, bid_sequence"
            ),
            in_params,
        )
        bids_by_hand: dict[str, list] = defaultdict(list)
        for row in bids_result.mappings():
            bids_by_hand[str(row["hand_id"])].append(row)

        # Load all tricks for these hands in one query
        tricks_result = await db.execute(
            text(
                f"SELECT hand_id, trick_number, led_by_player_id, won_by_player_id, "
                f"north_card, east_card, south_card, west_card, trick_points "
                f"FROM tricks WHERE hand_id {in_clause} ORDER BY hand_id, trick_number"
            ),
            in_params,
        )
        tricks_by_hand: dict[str, list] = defaultdict(list)
        for row in tricks_result.mappings():
            tricks_by_hand[str(row["hand_id"])].append(row)

        def pid_to_seat(pid_str: str | None) -> str | None:
            return player_id_to_seat.get(str(pid_str)) if pid_str else None

        for hand in hand_rows:
            hid = str(hand["id"])

            replay_bids = [
                ReplayBid(
                    seat=pid_to_seat(str(b["player_id"])) or str(b["player_id"]),
                    bid_amount=b["bid_amount"],
                    is_shoot_the_moon=bool(b["is_shoot_the_moon"]),
                )
                for b in bids_by_hand[hid]
            ]

            replay_tricks = [
                ReplayTrick(
                    trick_number=t["trick_number"],
                    led_by_seat=pid_to_seat(t["led_by_player_id"]),
                    won_by_seat=pid_to_seat(t["won_by_player_id"]),
                    cards={
                        "north": t["north_card"],
                        "east": t["east_card"],
                        "south": t["south_card"],
                        "west": t["west_card"],
                    },
                    trick_points=t["trick_points"],
                )
                for t in tricks_by_hand[hid]
            ]

            replay_hands.append(
                ReplayHand(
                    hand_number=hand["hand_number"],
                    winning_bidder_seat=pid_to_seat(hand["winning_bidder_id"]),
                    winning_bid_amount=hand["winning_bid_amount"],
                    is_shoot_the_moon=bool(hand["is_shoot_the_moon"]),
                    trump_suit=hand["trump_suit"],
                    ns_meld_score=hand["ns_meld_score"],
                    ew_meld_score=hand["ew_meld_score"],
                    ns_trick_score=hand["ns_trick_score"],
                    ew_trick_score=hand["ew_trick_score"],
                    is_set=bool(hand["is_set"]) if hand["is_set"] is not None else None,
                    bids=replay_bids,
                    tricks=replay_tricks,
                )
            )

    return ReplayResponse(
        room_code=game.room_code,
        status=game.status,
        final_scores={"ns": game.ns_total_score, "ew": game.ew_total_score},
        players=players,
        hands=replay_hands,
    )
