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
from app.engine.meld import calculate_melds
from app.engine.tricks import RANK_ORDER, card_suit, get_legal_cards
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


class CreateVsAiRequest(BaseModel):
    hints_enabled: bool = True


@router.post(
    "/create-vs-ai",
    response_model=CreateGameResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_vs_ai(
    body: CreateVsAiRequest | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new game with the human at SOUTH and 3 bots filling the rest."""
    from app.bot.users import BOT_UUIDS, get_or_create_bots

    await get_or_create_bots(db)

    hints = body.hints_enabled if body else True
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
                "hints_enabled": hints,
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


# ---------------------------------------------------------------------------
# Hint endpoint — practice-mode suggestions
# ---------------------------------------------------------------------------

SUIT_NAMES = {"H": "HEARTS", "S": "SPADES", "D": "DIAMONDS", "C": "CLUBS"}
SUIT_CHARS = {"HEARTS": "H", "SPADES": "S", "DIAMONDS": "D", "CLUBS": "C"}


class HintResponse(BaseModel):
    phase: str
    suggestion: dict


def _suggest_bid(hand: list[str], bidding_state: dict) -> dict:
    """Evaluate hand strength and suggest a bid or pass with explanation."""
    best_meld = 0
    best_suit = "HEARTS"
    for suit_char, suit_name in SUIT_NAMES.items():
        melds = calculate_melds(hand, suit_name)
        total = sum(m["points"] for m in melds)
        if total > best_meld:
            best_meld = total
            best_suit = suit_name

    high_cards = sum(1 for c in hand if c[:-1] in ("A", "10"))
    strength = best_meld + high_cards
    winning_bid = bidding_state.get("winning_bid")
    # minimum_valid_bid isn't in persisted state — compute from winning_bid
    minimum = (winning_bid + 1) if winning_bid is not None else 25

    dealer_forced = (
        winning_bid is None
        and len(bidding_state.get("passed_seats", [])) == 3
    )

    if dealer_forced or (
        strength >= 20 and (winning_bid is None or minimum <= strength + 5)
    ):
        reason = (
            f"Your hand has {best_meld} meld points (best in {best_suit}) "
            f"and {high_cards} high cards"
        )
        if dealer_forced:
            reason += ". As dealer, you must bid"
        return {"action": "bid", "amount": minimum, "reason": reason}

    return {
        "action": "pass",
        "amount": None,
        "reason": (
            f"Your hand has only {best_meld} meld points and "
            f"{high_cards} high cards — not strong enough to bid"
        ),
    }


def _suggest_trump(hand: list[str]) -> dict:
    """Pick the best trump suit with explanation."""
    best_suit_char = "H"
    best_score = -1
    details: dict[str, dict] = {}

    for suit_char, suit_name in SUIT_NAMES.items():
        count = sum(1 for c in hand if card_suit(c) == suit_char)
        melds = calculate_melds(hand, suit_name)
        meld_total = sum(m["points"] for m in melds)
        score = count * 2 + meld_total
        details[suit_name] = {"count": count, "meld": meld_total}
        if score > best_score:
            best_score = score
            best_suit_char = suit_char

    best_name = SUIT_NAMES[best_suit_char]
    info = details[best_name]
    return {
        "suit": best_name,
        "reason": (
            f"You have {info['count']} {best_name.capitalize()} "
            f"with {info['meld']} meld points in that suit"
        ),
    }


def _suggest_pass_cards(hand: list[str], trump_suit: str) -> dict:
    """Suggest 3 weakest non-trump cards to pass."""
    trump_char = SUIT_CHARS.get(trump_suit, trump_suit)
    non_trump = [c for c in hand if card_suit(c) != trump_char]

    if len(non_trump) >= 3:
        non_trump.sort(key=lambda c: RANK_ORDER.get(c[:-1], 0))
        cards = non_trump[:3]
    else:
        sorted_hand = sorted(hand, key=lambda c: RANK_ORDER.get(c[:-1], 0))
        cards = sorted_hand[:3]

    return {
        "cards": cards,
        "reason": "Pass your weakest non-trump cards to your partner",
    }


def _suggest_card(hand: list[str], state: dict, seat: str) -> dict:
    """Pick a strategic card with explanation."""
    trick_play = state.get("current_hand", {}).get("trick_play", {})
    cards_played = trick_play.get("cards_played", [])
    trump_suit = state.get("current_hand", {}).get("trump_suit", "HEARTS")
    trump_char = SUIT_CHARS.get(trump_suit, trump_suit)

    led_suit = None
    if cards_played:
        led_suit = card_suit(cards_played[0]["card"])

    legal = get_legal_cards(hand, led_suit, trump_char, cards_played)
    if not legal:
        legal = list(hand)

    if not legal:
        return {"card": None, "reason": "No cards available to play"}

    # Sort legal cards by rank (highest first)
    sorted_legal = sorted(
        legal, key=lambda c: RANK_ORDER.get(c[:-1], 0), reverse=True
    )

    if not cards_played:
        # Leading: play highest card (prefer trump, then off-suit aces)
        trump_cards = [c for c in sorted_legal if card_suit(c) == trump_char]
        if trump_cards:
            return {"card": trump_cards[0], "reason": "Lead with your strongest trump card"}
        return {"card": sorted_legal[0], "reason": "Lead with your strongest card"}

    # Following: try to win with the minimum winning card, else dump lowest
    # Check which legal cards would win
    from app.engine.tricks import _would_win
    winners = [c for c in sorted_legal if _would_win(c, cards_played, trump_char)]

    if winners:
        # Play the lowest card that still wins (conserve strong cards)
        best = sorted(winners, key=lambda c: RANK_ORDER.get(c[:-1], 0))[0]
        if card_suit(best) == trump_char and led_suit != trump_char:
            return {"card": best, "reason": "Trump in to win this trick"}
        return {"card": best, "reason": "Play your lowest card that wins the trick"}

    # Can't win — dump the lowest card to save strong cards
    worst = sorted_legal[-1]
    return {"card": worst, "reason": "You can't win this trick — play your lowest card"}


@router.get("/{room_code}/hint", response_model=HintResponse)
async def get_hint(
    room_code: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a context-aware hint for the human player's current situation."""
    result = await db.execute(
        select(Game).where(Game.room_code == room_code, Game.status == "IN_PROGRESS")
    )
    game = result.scalar_one_or_none()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    state = game.current_state_json or {}

    if not state.get("hints_enabled"):
        raise HTTPException(status_code=403, detail="Hints are not enabled for this game")

    # Resolve the human's seat (state uses uppercase keys like "SOUTH")
    seat = None
    for s in SEAT_COLUMNS:
        col = f"{s}_player_id"
        if getattr(game, col) == user.id:
            seat = s.upper()
            break

    if seat is None:
        raise HTTPException(status_code=403, detail="You are not seated in this game")

    phase = state.get("phase", "LOBBY_WAITING")
    hand = state.get("player_hands", {}).get(seat, [])
    current_hand = state.get("current_hand", {})

    if phase == "BIDDING":
        bidding = current_hand.get("bidding", {})
        suggestion = _suggest_bid(hand, bidding)
    elif phase == "NAMING_TRUMP":
        suggestion = _suggest_trump(hand)
    elif phase == "PASSING_CARDS":
        trump = current_hand.get("trump_suit", "HEARTS")
        suggestion = _suggest_pass_cards(hand, trump)
    elif phase == "TRICK_PLAYING":
        suggestion = _suggest_card(hand, state, seat)
    elif phase in ("SHOWING_MELD", "HAND_COMPLETE"):
        suggestion = {"action": "acknowledge", "reason": "Click to continue"}
    else:
        suggestion = {"action": "none", "reason": f"No hint available for phase {phase}"}

    return HintResponse(phase=phase, suggestion=suggestion)
