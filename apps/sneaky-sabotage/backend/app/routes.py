"""REST API routes for game creation and joining."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.game_engine import create_game, get_game_with_players, join_game
from app.schemas import (
    CreateGameRequest,
    CreateGameResponse,
    GameInfo,
    JoinGameRequest,
    JoinGameResponse,
    PlayerInfo,
)

router = APIRouter(prefix="/api")


@router.post("/games", response_model=CreateGameResponse)
async def create_game_endpoint(
    req: CreateGameRequest,
    db: AsyncSession = Depends(get_db),
):
    game, player = await create_game(
        db,
        player_name=req.player_name,
        timer_seconds=req.timer_seconds,
        max_rounds=req.max_rounds,
    )
    return CreateGameResponse(
        game_id=game.id,
        player_id=player.id,
        session_token=player.session_token,
    )


@router.post("/games/{game_id}/join", response_model=JoinGameResponse)
async def join_game_endpoint(
    game_id: str,
    req: JoinGameRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        player = await join_game(db, game_id.upper(), req.player_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return JoinGameResponse(
        game_id=game_id.upper(),
        player_id=player.id,
        session_token=player.session_token,
    )


@router.get("/games/{game_id}", response_model=GameInfo)
async def get_game_endpoint(
    game_id: str,
    db: AsyncSession = Depends(get_db),
):
    game = await get_game_with_players(db, game_id.upper())
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return GameInfo(
        id=game.id,
        status=game.status,
        current_round=game.current_round,
        max_rounds=game.max_rounds,
        timer_seconds=game.timer_seconds,
        players=[
            PlayerInfo(
                id=p.id,
                name=p.name,
                is_host=p.is_host,
                total_score=p.total_score,
                connected=p.connected,
            )
            for p in game.players
        ],
    )
