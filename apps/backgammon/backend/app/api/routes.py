"""REST API routes for the backgammon application."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database import get_db
from app.models import Player, Table, MoveRecord
from app.schemas import (
    PlayerCreate,
    PlayerResponse,
    TableCreate,
    TableResponse,
    JoinTableRequest,
    MoveRecordResponse,
    StatsOverview,
    DashboardResponse,
    GameHistoryItem,
)
from app.services.game_service import game_manager
from app.services.stats_service import get_player_stats
from app.api.websocket import notify_game_started

router = APIRouter(prefix="/api")


# ------------------------------------------------------------------
# Player endpoints
# ------------------------------------------------------------------


@router.post("/players", response_model=PlayerResponse)
async def create_player(
    data: PlayerCreate, db: AsyncSession = Depends(get_db)
) -> Player:
    """Register a new player with a nickname (backwards-compatible guest creation)."""
    player = Player(nickname=data.nickname, is_guest=True, auth_provider="guest")
    db.add(player)
    await db.flush()
    await db.refresh(player)
    return player


@router.get("/players/{player_id}", response_model=PlayerResponse)
async def get_player(
    player_id: str, db: AsyncSession = Depends(get_db)
) -> Player:
    """Retrieve a player by ID."""
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return player


@router.get("/players/{player_id}/stats", response_model=StatsOverview)
async def player_stats(
    player_id: str, db: AsyncSession = Depends(get_db)
) -> dict:
    """Get aggregated statistics for a player across all opponents.

    Returns 403 for guest players since their stats are not persisted.
    """
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    if player.is_guest:
        raise HTTPException(
            status_code=403,
            detail="Stats are not available for guest players",
        )
    return await get_player_stats(db, player_id)


@router.get("/players/{player_id}/dashboard", response_model=DashboardResponse)
async def player_dashboard(
    player_id: str, db: AsyncSession = Depends(get_db)
) -> dict:
    """Get a player's dashboard with past games, results, and summary stats.

    Returns 404 if the player does not exist, 403 for guest players.
    """
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    if player.is_guest:
        raise HTTPException(
            status_code=403,
            detail="Dashboard is not available for guest players",
        )

    # Query all tables where the player participated and the game actually started
    stmt = (
        select(Table)
        .where(
            or_(
                Table.white_player_id == player_id,
                Table.black_player_id == player_id,
            ),
            Table.status != "waiting",
        )
        .order_by(Table.created_at.desc())
    )
    result = await db.execute(stmt)
    tables = result.scalars().all()

    games: list[GameHistoryItem] = []
    wins = 0
    losses = 0
    abandoned_games = 0

    for table in tables:
        # Determine player color
        if table.white_player_id == player_id:
            player_color = "white"
            opponent_id = table.black_player_id
        else:
            player_color = "black"
            opponent_id = table.white_player_id

        # Load opponent nickname
        if opponent_id:
            opponent = await db.get(Player, opponent_id)
            opponent_nickname = opponent.nickname if opponent else "Unknown"
        else:
            opponent_nickname = "Unknown"

        # Determine result
        if table.status == "finished":
            if table.winner_id == player_id:
                result_str = "win"
                wins += 1
            else:
                result_str = "loss"
                losses += 1
            win_type = table.win_type
            score = table.final_score
            played_at = table.finished_at or table.created_at
        else:
            result_str = "abandoned"
            abandoned_games += 1
            win_type = None
            score = None
            played_at = table.created_at

        games.append(
            GameHistoryItem(
                table_id=table.id,
                opponent_nickname=opponent_nickname,
                player_color=player_color,
                result=result_str,
                win_type=win_type,
                score=score,
                played_at=played_at,
            )
        )

    total_games = wins + losses
    win_rate = (wins / total_games * 100) if total_games > 0 else 0.0

    return DashboardResponse(
        total_games=total_games,
        wins=wins,
        losses=losses,
        win_rate=win_rate,
        abandoned_games=abandoned_games,
        games=games,
    )


# ------------------------------------------------------------------
# Table endpoints
# ------------------------------------------------------------------


@router.post("/tables", response_model=TableResponse)
async def create_table(
    data: TableCreate, db: AsyncSession = Depends(get_db)
) -> Table:
    """Create a new game table. The creating player waits for an opponent."""
    player = await db.get(Player, data.player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    table = await game_manager.create_table(db, data.player_id)
    await db.refresh(table)
    # Eagerly load the white_player relationship for the response
    table.white_player = player
    return table


@router.get("/tables/{table_id}", response_model=TableResponse)
async def get_table(
    table_id: str, db: AsyncSession = Depends(get_db)
) -> Table:
    """Retrieve a table by ID, including player details."""
    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    # Eagerly load player relationships for the response
    if table.white_player_id:
        table.white_player = await db.get(Player, table.white_player_id)
    if table.black_player_id:
        table.black_player = await db.get(Player, table.black_player_id)
    return table


@router.post("/tables/{table_id}/join", response_model=TableResponse)
async def join_table(
    table_id: str, data: JoinTableRequest, db: AsyncSession = Depends(get_db)
) -> Table:
    """Join an existing table as the second player. Starts the game."""
    player = await db.get(Player, data.player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    try:
        table = await game_manager.join_table(db, table_id, data.player_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Load relationships for the response
    if table.white_player_id:
        table.white_player = await db.get(Player, table.white_player_id)
    if table.black_player_id:
        table.black_player = await db.get(Player, table.black_player_id)

    # Notify any WebSocket clients already connected (the first player
    # is sitting on a "waiting" screen and needs the initial game state).
    await notify_game_started(table_id)

    return table


# ------------------------------------------------------------------
# Game history
# ------------------------------------------------------------------


@router.get("/tables/{table_id}/history", response_model=list[MoveRecordResponse])
async def get_game_history(
    table_id: str, db: AsyncSession = Depends(get_db)
) -> list[MoveRecord]:
    """Retrieve the move history for a game, ordered by move number."""
    result = await db.execute(
        select(MoveRecord)
        .where(MoveRecord.table_id == table_id)
        .order_by(MoveRecord.move_number)
    )
    return result.scalars().all()
