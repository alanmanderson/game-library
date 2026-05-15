"""REST API routes for tournament management."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Player, Tournament, TournamentMatch, TournamentEntry
from app.schemas import (
    TournamentCreate,
    TournamentResponse,
    TournamentBracketResponse,
)
from app.services import tournament_service
from app.services.game_service import game_manager
from app.api.auth import get_current_player

tournament_router = APIRouter(prefix="/api/tournaments")


@tournament_router.get("", response_model=list[TournamentResponse])
async def list_tournaments(
    db: AsyncSession = Depends(get_db),
) -> list[TournamentResponse]:
    """List all tournaments, newest first."""
    return await tournament_service.list_tournaments(db)


@tournament_router.post("", response_model=TournamentResponse)
async def create_tournament(
    data: TournamentCreate,
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> TournamentResponse:
    """Create a new tournament."""
    if current_player.is_guest:
        raise HTTPException(status_code=403, detail="Guest players cannot create tournaments")

    tournament = await tournament_service.create_tournament(db, data, current_player.id)
    await db.commit()
    await db.refresh(tournament)

    # Count entries (will be 0 for new tournament)
    return TournamentResponse(
        id=tournament.id,
        name=tournament.name,
        max_players=tournament.max_players,
        match_points=tournament.match_points,
        status=tournament.status,
        created_by=tournament.created_by,
        created_at=tournament.created_at,
        winner_id=tournament.winner_id,
        player_count=0,
    )


@tournament_router.get("/{tournament_id}", response_model=TournamentBracketResponse)
async def get_tournament(
    tournament_id: str,
    db: AsyncSession = Depends(get_db),
) -> TournamentBracketResponse:
    """Get full tournament details including bracket."""
    try:
        return await tournament_service.get_bracket(db, tournament_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@tournament_router.post("/{tournament_id}/register", response_model=TournamentBracketResponse)
async def register_for_tournament(
    tournament_id: str,
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> TournamentBracketResponse:
    """Register the current player for a tournament."""
    if current_player.is_guest:
        raise HTTPException(status_code=403, detail="Guest players cannot join tournaments")

    try:
        await tournament_service.register_player(db, tournament_id, current_player.id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return await tournament_service.get_bracket(db, tournament_id)


@tournament_router.post("/{tournament_id}/start", response_model=TournamentBracketResponse)
async def start_tournament(
    tournament_id: str,
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> TournamentBracketResponse:
    """Start the tournament and generate the bracket.

    Only the tournament creator can start it.
    """
    tournament = await db.get(Tournament, tournament_id)
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if tournament.created_by != current_player.id:
        raise HTTPException(status_code=403, detail="Only the tournament creator can start it")

    try:
        await tournament_service.start_tournament(db, tournament_id)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return await tournament_service.get_bracket(db, tournament_id)


@tournament_router.post("/{tournament_id}/matches/{match_id}/start-table", response_model=dict)
async def start_match_table(
    tournament_id: str,
    match_id: int,
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a game table for a pending tournament match.

    Either player in the match can trigger this. The first to call it
    creates the table; subsequent calls return the existing table ID.
    """
    tournament = await db.get(Tournament, tournament_id)
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    if tournament.status != "in_progress":
        raise HTTPException(status_code=400, detail="Tournament is not in progress")

    match = await db.get(TournamentMatch, match_id)
    if not match or match.tournament_id != tournament_id:
        raise HTTPException(status_code=404, detail="Match not found")
    if match.status not in ("pending",):
        raise HTTPException(status_code=400, detail="Match is not pending")

    # Verify the current player is in this match
    if current_player.id not in (match.player1_id, match.player2_id):
        raise HTTPException(status_code=403, detail="You are not a participant in this match")

    # If a table already exists, return it
    if match.table_id:
        return {"table_id": match.table_id}

    # Create a new table for this match
    table = await game_manager.create_table(
        db,
        current_player.id,
        preferred_color=None,
        match_points=tournament.match_points,
        is_public=False,
    )
    await db.flush()

    match.table_id = table.id
    match.status = "playing"
    await db.commit()

    return {"table_id": table.id}
