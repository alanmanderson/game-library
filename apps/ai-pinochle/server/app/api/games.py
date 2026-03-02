import random
import string
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.game import Game
from app.models.user import User

router = APIRouter()


class CreateGameResponse(BaseModel):
    room_code: str


class JoinGameResponse(BaseModel):
    room_code: str
    game_id: uuid.UUID
    phase: str
    seats: dict[str, str | None]


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
            current_state_json={"room_code": code, "phase": "LOBBY_WAITING"},
        )
        db.add(game)
        try:
            await db.flush()
            return CreateGameResponse(room_code=code)
        except IntegrityError:
            await db.rollback()

    # Extremely unlikely — all 10 attempts collided
    raise Exception("failed to generate unique room code")


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

    id_to_username: dict[uuid.UUID, str] = {}
    if all_player_ids:
        rows = await db.execute(select(User).where(User.id.in_(all_player_ids)))
        for u in rows.scalars():
            id_to_username[u.id] = u.username

    summaries = []
    for game in games:
        phase = (game.current_state_json or {}).get("phase", "LOBBY_WAITING")
        players: dict[str, str | None] = {}
        for seat in SEAT_COLUMNS:
            pid = getattr(game, f"{seat}_player_id")
            players[seat] = id_to_username.get(pid) if pid else None

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
    result = await db.execute(
        select(Game).where(Game.room_code == room_code, Game.status == "IN_PROGRESS")
    )
    game = result.scalar_one_or_none()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    phase = (game.current_state_json or {}).get("phase", "LOBBY_WAITING")

    seats: dict[str, str | None] = {}
    player_ids = {
        seat: getattr(game, f"{seat}_player_id") for seat in SEAT_COLUMNS
    }

    # Batch-fetch usernames for occupied seats
    occupied_ids = [pid for pid in player_ids.values() if pid is not None]
    id_to_username: dict[uuid.UUID, str] = {}
    if occupied_ids:
        rows = await db.execute(select(User).where(User.id.in_(occupied_ids)))
        for u in rows.scalars():
            id_to_username[u.id] = u.username

    for seat, pid in player_ids.items():
        seats[seat] = id_to_username.get(pid) if pid else None

    return JoinGameResponse(
        room_code=game.room_code,
        game_id=game.id,
        phase=phase,
        seats=seats,
    )
