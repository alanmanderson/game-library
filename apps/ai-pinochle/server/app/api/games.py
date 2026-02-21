import random
import string

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.game import Game
from app.models.user import User

router = APIRouter()


class CreateGameResponse(BaseModel):
    room_code: str


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
