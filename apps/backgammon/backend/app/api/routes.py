"""REST API routes for the backgammon application."""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, case

from app.database import get_db
from app.models import GameAnalysis, Player, Table, MoveRecord, PlayerStats, Season
from app.schemas import (
    AnalysisResponse,
    MoveAnalysis,
    PlayerResponse,
    PlayerPreferencesUpdate,
    TableCreate,
    TableResponse,
    JoinTableRequest,
    InviteBotRequest,
    MoveRecordResponse,
    PaginatedMoveHistoryResponse,
    StatsOverview,
    AdvancedStatsResponse,
    DashboardResponse,
    GameHistoryItem,
    LobbyTable,
    ActiveGame,
    LeaderboardEntry,
    LeaderboardResponse,
    ReplayMoveRecord,
    ReplayResponse,
    SeasonResponse,
    PlayerSeasonHistoryEntry,
    ChallengesResponse,
    ChallengeProgress,
)
from app.cosmetics import BOARD_THEMES, CHECKER_STYLES
from app.services.game_service import game_manager
from app.services.stats_service import get_player_stats, get_advanced_stats
from app.services.season_stats_service import get_season_history
from app.services.bot_service import (
    BOT_PLAYER_ID, ensure_bot_player, schedule_bot_turn_if_needed,
    set_bot_difficulty,
)
from app.api.websocket import notify_game_started, manager as ws_manager
from app.api.auth import get_current_player

router = APIRouter(prefix="/api")


# ------------------------------------------------------------------
# Player endpoints
# ------------------------------------------------------------------


@router.get("/players/{player_id}", response_model=PlayerResponse)
async def get_player(
    player_id: str,
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> Player:
    """Retrieve a player by ID."""
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return player


@router.patch("/players/me/preferences", response_model=PlayerResponse)
async def update_my_preferences(
    data: PlayerPreferencesUpdate,
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> Player:
    """Update the authenticated player's cosmetic preferences.

    Accepts a partial update (``board_theme`` and/or ``checker_style``).
    Rejects unknown theme/style IDs with 400. Guests may also call this
    so their choice lasts for their session — the row will be deleted when
    the guest record is cleaned up, so persistence is best-effort.
    """
    if data.board_theme is not None:
        if data.board_theme not in BOARD_THEMES:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown board_theme: {data.board_theme!r}",
            )
        current_player.board_theme = data.board_theme

    if data.checker_style is not None:
        if data.checker_style not in CHECKER_STYLES:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown checker_style: {data.checker_style!r}",
            )
        current_player.checker_style = data.checker_style

    await db.flush()
    await db.refresh(current_player)
    return current_player


@router.get("/players/{player_id}/stats", response_model=StatsOverview)
async def player_stats(
    player_id: str,
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get aggregated statistics for a player across all opponents.

    Returns 403 for guest players since their stats are not persisted.
    """
    if current_player.id != player_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this resource")
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    if player.is_guest:
        raise HTTPException(
            status_code=403,
            detail="Stats are not available for guest players",
        )
    return await get_player_stats(db, player_id)


@router.get(
    "/players/{player_id}/advanced-stats",
    response_model=AdvancedStatsResponse,
)
async def player_advanced_stats(
    player_id: str,
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return advanced per-player statistics.

    Includes gammon/backgammon rates, per-color win rates, per-time-control
    win rates, cube action counts, and an ELO rating history series.
    Guarded the same way as ``/dashboard``: authenticated player must match,
    guests are rejected since their stats are not persisted.
    """
    if current_player.id != player_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this resource")
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    if player.is_guest:
        raise HTTPException(
            status_code=403,
            detail="Advanced stats are not available for guest players",
        )
    return await get_advanced_stats(db, player_id)


@router.get(
    "/players/{player_id}/season-history",
    response_model=list[PlayerSeasonHistoryEntry],
)
async def player_season_history(
    player_id: str,
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    """Return the player's per-season history snapshots.

    One row per season they've played at least one rated game in, ordered
    with the active / most recent season first. Guarded identically to
    ``/advanced-stats``: the requester must be the player themselves and
    guests are rejected (no season stats are persisted for guests).
    """
    if current_player.id != player_id:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this resource"
        )
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    if player.is_guest:
        raise HTTPException(
            status_code=403,
            detail="Season history is not available for guest players",
        )
    return await get_season_history(db, player_id)


@router.get("/challenges/me", response_model=ChallengesResponse)
async def my_challenges(
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> ChallengesResponse:
    """Return the authenticated player's active daily + weekly challenges.

    Guests are rejected — challenge progress is only persisted for registered
    accounts. PlayerChallenge rows for the current period are upserted on
    demand so callers never see a stale or missing period.
    """
    if current_player.is_guest:
        raise HTTPException(
            status_code=403,
            detail="Challenges are not available for guest players",
        )

    from app.services.challenge_service import get_active_player_challenges

    rows = await get_active_player_challenges(db, current_player.id)
    await db.commit()
    daily = [ChallengeProgress(**r) for r in rows if r["type"] == "daily"]
    weekly = [ChallengeProgress(**r) for r in rows if r["type"] == "weekly"]
    return ChallengesResponse(
        daily=daily,
        weekly=weekly,
        challenge_points=getattr(current_player, "challenge_points", 0) or 0,
    )


@router.get("/players/{player_id}/dashboard", response_model=DashboardResponse)
async def player_dashboard(
    player_id: str,
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """Get a player's dashboard with past games, results, and summary stats.

    Returns 404 if the player does not exist, 403 for guest players.
    Supports pagination via limit and offset query parameters.
    """
    if current_player.id != player_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this resource")
    player = await db.get(Player, player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    if player.is_guest:
        raise HTTPException(
            status_code=403,
            detail="Dashboard is not available for guest players",
        )

    # Base filter for tables where the player participated and the game started
    table_filter = [
        or_(
            Table.white_player_id == player_id,
            Table.black_player_id == player_id,
        ),
        Table.status != "waiting",
    ]

    # Get total count of matching tables
    count_result = await db.execute(
        select(func.count(Table.id)).where(*table_filter)
    )
    total_count = count_result.scalar()

    # Query tables with pagination
    stmt = (
        select(Table)
        .where(*table_filter)
        .order_by(Table.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    tables = result.scalars().all()

    # Batch-load all opponents to avoid N+1 queries
    opponent_ids: set[str] = set()
    for table in tables:
        if table.white_player_id == player_id:
            if table.black_player_id:
                opponent_ids.add(table.black_player_id)
        else:
            if table.white_player_id:
                opponent_ids.add(table.white_player_id)

    if opponent_ids:
        opponents_result = await db.execute(
            select(Player).where(Player.id.in_(opponent_ids))
        )
        opponent_lookup = {p.id: p for p in opponents_result.scalars().all()}
    else:
        opponent_lookup = {}

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

        # Look up opponent nickname from batch-loaded dict
        if opponent_id:
            opponent = opponent_lookup.get(opponent_id)
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
                table_status=table.status,
            )
        )

    total_games = wins + losses
    win_rate = (wins / total_games * 100) if total_games > 0 else 0.0

    # Look up the currently active season, if any, so the dashboard can show it.
    active_season_row = await db.execute(
        select(Season).where(Season.is_active.is_(True)).limit(1)
    )
    active_season = active_season_row.scalars().first()

    return DashboardResponse(
        total_games=total_games,
        wins=wins,
        losses=losses,
        win_rate=win_rate,
        abandoned_games=abandoned_games,
        total_count=total_count,
        games=games,
        rating=player.rating,
        rating_games=player.rating_games,
        challenge_points=getattr(player, "challenge_points", 0) or 0,
        active_season=(
            SeasonResponse.model_validate(active_season) if active_season else None
        ),
    )


# ------------------------------------------------------------------
# Table endpoints
# ------------------------------------------------------------------


@router.post("/tables", response_model=TableResponse)
async def create_table(
    data: TableCreate,
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> Table:
    """Create a new game table. The creating player waits for an opponent."""
    table = await game_manager.create_table(db, current_player.id, data.preferred_color, data.match_points, data.is_public, data.time_control, data.is_ranked)
    await db.refresh(table)
    # Eagerly load the player relationship for the response
    if table.white_player_id == current_player.id:
        table.white_player = current_player
    elif table.black_player_id == current_player.id:
        table.black_player = current_player
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
    table_id: str,
    data: JoinTableRequest,
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> Table:
    """Join an existing table as the second player. Starts the game."""
    try:
        table = await game_manager.join_table(db, table_id, current_player.id)
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


@router.post("/tables/{table_id}/invite-bot", response_model=TableResponse)
async def invite_bot(
    table_id: str,
    data: InviteBotRequest = InviteBotRequest(),
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
) -> Table:
    """Invite the bot to join a table as the opponent."""
    await ensure_bot_player(db)
    try:
        table = await game_manager.join_table(db, table_id, BOT_PLAYER_ID)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Store difficulty on the table and in memory
    table.bot_difficulty = data.difficulty
    set_bot_difficulty(table_id, data.difficulty)

    # Load relationships for the response
    if table.white_player_id:
        table.white_player = await db.get(Player, table.white_player_id)
    if table.black_player_id:
        table.black_player = await db.get(Player, table.black_player_id)

    await db.commit()

    # Notify WebSocket clients of game start
    await notify_game_started(table_id)

    # If the bot goes first, schedule its turn
    schedule_bot_turn_if_needed(table_id)

    return table


# ------------------------------------------------------------------
# Lobby / matchmaking
# ------------------------------------------------------------------


@router.get("/lobby", response_model=list[LobbyTable])
async def get_lobby(db: AsyncSession = Depends(get_db)):
    """Get all public tables waiting for opponents."""
    result = await db.execute(
        select(Table).where(
            Table.is_public == True,  # noqa: E712
            Table.status == "waiting",
        ).order_by(Table.created_at.desc()).limit(20)
    )
    tables = result.scalars().all()

    # Load creator nicknames
    creator_ids: set[str] = set()
    for table in tables:
        cid = table.white_player_id or table.black_player_id
        if cid:
            creator_ids.add(cid)

    if creator_ids:
        players_result = await db.execute(
            select(Player).where(Player.id.in_(creator_ids))
        )
        player_lookup = {p.id: p for p in players_result.scalars().all()}
    else:
        player_lookup = {}

    lobby_tables: list[LobbyTable] = []
    for table in tables:
        creator_id = table.white_player_id or table.black_player_id
        creator = player_lookup.get(creator_id) if creator_id else None
        # Determine preferred color based on which slot the creator took
        if table.white_player_id and not table.black_player_id:
            preferred_color = "white"
        elif table.black_player_id and not table.white_player_id:
            preferred_color = "black"
        else:
            preferred_color = None

        lobby_tables.append(
            LobbyTable(
                id=table.id,
                creator_nickname=creator.nickname if creator else "Unknown",
                match_points=table.match_points,
                preferred_color=preferred_color,
                created_at=table.created_at,
                is_ranked=table.is_ranked,
            )
        )

    return lobby_tables


@router.get("/active-games", response_model=list[ActiveGame])
async def get_active_games(db: AsyncSession = Depends(get_db)):
    """Get all public tables with games currently in progress.

    Returns tables with status 'playing' or 'game_over', ordered by most
    recently created. Includes live spectator counts.
    """
    result = await db.execute(
        select(Table).where(
            Table.is_public.is_(True),
            Table.status.in_(["playing", "game_over"]),
        ).order_by(Table.created_at.desc()).limit(20)
    )
    tables = result.scalars().all()

    # Load player nicknames
    player_ids: set[str] = set()
    for table in tables:
        if table.white_player_id:
            player_ids.add(table.white_player_id)
        if table.black_player_id:
            player_ids.add(table.black_player_id)

    if player_ids:
        players_result = await db.execute(
            select(Player).where(Player.id.in_(player_ids))
        )
        player_lookup = {p.id: p for p in players_result.scalars().all()}
    else:
        player_lookup = {}

    active_games: list[ActiveGame] = []
    for table in tables:
        white = player_lookup.get(table.white_player_id) if table.white_player_id else None
        black = player_lookup.get(table.black_player_id) if table.black_player_id else None
        active_games.append(
            ActiveGame(
                id=table.id,
                white_player_nickname=white.nickname if white else "Unknown",
                black_player_nickname=black.nickname if black else "Unknown",
                match_points=table.match_points,
                white_match_score=table.white_match_score,
                black_match_score=table.black_match_score,
                spectator_count=ws_manager.get_spectator_count(table.id),
                created_at=table.created_at,
                is_ranked=table.is_ranked,
            )
        )

    return active_games


@router.post("/quick-match", response_model=TableResponse)
async def quick_match(
    current_player: Player = Depends(get_current_player),
    db: AsyncSession = Depends(get_db),
):
    """Join an available public table or create a new one.

    Tries to find an existing waiting public table that wasn't created
    by the requesting player. If found, joins it. Otherwise, creates a
    new public table.
    """
    # Try to find a waiting public table not created by this player
    result = await db.execute(
        select(Table).where(
            Table.is_public == True,  # noqa: E712
            Table.status == "waiting",
            Table.white_player_id != current_player.id,
            Table.black_player_id != current_player.id,
        ).order_by(Table.created_at.asc()).limit(1)
    )
    existing_table = result.scalars().first()

    if existing_table:
        # Join the existing table
        try:
            table = await game_manager.join_table(db, existing_table.id, current_player.id)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        # Load relationships
        if table.white_player_id:
            table.white_player = await db.get(Player, table.white_player_id)
        if table.black_player_id:
            table.black_player = await db.get(Player, table.black_player_id)
        await notify_game_started(table.id)
        return table

    # No available table found; create a new public one
    table = await game_manager.create_table(db, current_player.id, is_public=True)
    await db.refresh(table)
    if table.white_player_id == current_player.id:
        table.white_player = current_player
    elif table.black_player_id == current_player.id:
        table.black_player = current_player
    return table


# ------------------------------------------------------------------
# Game history
# ------------------------------------------------------------------


@router.get("/tables/{table_id}/history", response_model=PaginatedMoveHistoryResponse)
async def get_game_history(
    table_id: str,
    limit: int = Query(default=50, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Retrieve the move history for a game, ordered by move number.

    Supports pagination via ``limit`` and ``offset`` query parameters.
    Returns total record count alongside the page of records.
    """
    # Total count of move records for this table
    count_result = await db.execute(
        select(func.count(MoveRecord.id))
        .where(MoveRecord.table_id == table_id)
    )
    total = count_result.scalar() or 0

    # Fetch the requested page
    result = await db.execute(
        select(MoveRecord)
        .where(MoveRecord.table_id == table_id)
        .order_by(MoveRecord.move_number)
        .limit(limit)
        .offset(offset)
    )
    records = result.scalars().all()

    return PaginatedMoveHistoryResponse(
        total=total,
        limit=limit,
        offset=offset,
        records=records,
    )


@router.get("/tables/{table_id}/replay", response_model=ReplayResponse)
async def get_game_replay(
    table_id: str, db: AsyncSession = Depends(get_db)
) -> dict:
    """Retrieve full replay data for a game, including per-move board snapshots.

    Returns the initial board state and all move records with their
    ``game_state_after`` snapshots, enabling step-by-step game replay.
    """
    from app.game_engine import BackgammonEngine

    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    # Replays are public but must not leak in-progress games.  "waiting" tables
    # have not started so there is nothing to leak; "game_over"/"finished" are
    # completed games meant for sharing.  Block "playing".
    if table.status == "playing":
        raise HTTPException(
            status_code=403,
            detail="Replay is only available for completed games.",
        )

    # Look up player nicknames
    white_nickname: str | None = None
    black_nickname: str | None = None
    white_player = None
    black_player = None
    if table.white_player_id:
        white_player = await db.get(Player, table.white_player_id)
        white_nickname = white_player.nickname if white_player else None
    if table.black_player_id:
        black_player = await db.get(Player, table.black_player_id)
        black_nickname = black_player.nickname if black_player else None

    # Determine winner color + nickname (if any)
    winner_color: str | None = None
    winner_nickname: str | None = None
    if table.winner_id:
        if table.winner_id == table.white_player_id:
            winner_color = "white"
            winner_nickname = white_nickname
        elif table.winner_id == table.black_player_id:
            winner_color = "black"
            winner_nickname = black_nickname

    # Build the standard initial board state
    initial_engine = BackgammonEngine()
    initial_state = initial_engine.get_state_snapshot()

    # Fetch all move records ordered by move number
    result = await db.execute(
        select(MoveRecord)
        .where(MoveRecord.table_id == table_id)
        .order_by(MoveRecord.move_number)
    )
    records = result.scalars().all()

    # Batch-load player nicknames for move records
    player_ids = {r.player_id for r in records if r.player_id}
    if player_ids:
        players_result = await db.execute(
            select(Player).where(Player.id.in_(player_ids))
        )
        player_lookup = {p.id: p for p in players_result.scalars().all()}
    else:
        player_lookup = {}

    moves = [
        ReplayMoveRecord(
            move_number=record.move_number,
            player_nickname=(
                player_lookup[record.player_id].nickname
                if record.player_id and record.player_id in player_lookup
                else None
            ),
            dice_roll=record.dice_roll,
            moves_notation=record.moves_notation,
            game_state_after=record.game_state_after,
            created_at=record.created_at,
        )
        for record in records
    ]

    return ReplayResponse(
        table_id=table_id,
        status=table.status,
        white_player_id=table.white_player_id,
        black_player_id=table.black_player_id,
        white_player_nickname=white_nickname,
        black_player_nickname=black_nickname,
        winner_color=winner_color,
        winner_nickname=winner_nickname,
        win_type=table.win_type,
        final_score=table.final_score,
        white_match_score=table.white_match_score,
        black_match_score=table.black_match_score,
        match_points=table.match_points,
        initial_state=initial_state,
        moves=moves,
    )


@router.get("/tables/{table_id}/analysis", response_model=AnalysisResponse)
async def get_game_analysis(
    table_id: str,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_player: Player = Depends(get_current_player),
) -> AnalysisResponse:
    """Return per-move quality analysis for a completed game.

    Compares each move the player actually made against the ML model's
    best move at that position and assigns a quality label (best, good,
    inaccuracy, mistake, blunder) based on equity loss.

    Results are cached in the ``game_analyses`` table so subsequent
    requests return instantly.  The first request for a game can be slow
    (seconds-to-tens-of-seconds depending on game length).

    Policy: only participants (the human white or black player of the
    table) may view the analysis.  Replays remain public, but move-quality
    data is skill-profile information we keep private to the two players
    at the board.  The ``BOT`` seat is excluded — when one side is a bot,
    only the human opponent qualifies.  Callers without a valid JWT get
    401; authenticated non-participants get 403.
    """
    import asyncio

    from app.game_engine import BackgammonEngine
    from app.services.analysis_service import compute_analysis

    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    # Participation gate: the caller must be one of the seated players.
    # The BOT player id never matches a human's player id, so when one
    # seat is the bot only the human at the other seat passes this check.
    participant_ids = {table.white_player_id, table.black_player_id}
    if current_player.id not in participant_ids:
        raise HTTPException(
            status_code=403,
            detail="Only players who participated in this game may view its analysis.",
        )

    if table.status == "playing":
        raise HTTPException(
            status_code=403,
            detail="Analysis is only available for completed games.",
        )

    # --- Count total moves (for display) up front ---
    total_result = await db.execute(
        select(func.count(MoveRecord.id)).where(MoveRecord.table_id == table_id)
    )
    total_moves = int(total_result.scalar() or 0)

    # --- Return cached analysis if it covers at least the requested range ---
    cached = await db.get(GameAnalysis, table_id)
    if cached is not None and cached.moves_analysed >= min(limit, total_moves):
        analyses = list(cached.move_analyses or [])[:limit]
        return AnalysisResponse(
            table_id=table_id,
            ml_available=bool(cached.ml_available),
            moves_analysed=len(analyses),
            total_moves=total_moves,
            move_analyses=[MoveAnalysis(**a) for a in analyses],
        )

    # --- Load initial board + records needed for computation ---
    records_result = await db.execute(
        select(MoveRecord)
        .where(MoveRecord.table_id == table_id)
        .order_by(MoveRecord.move_number)
    )
    records = records_result.scalars().all()

    # Batch-load player nicknames for the move players we'll report on.
    player_ids = {r.player_id for r in records if r.player_id}
    nickname_map: dict[str, str] = {}
    if player_ids:
        players_result = await db.execute(
            select(Player).where(Player.id.in_(player_ids))
        )
        for p in players_result.scalars().all():
            nickname_map[p.id] = p.nickname

    initial_state = BackgammonEngine().get_state_snapshot()

    # Correct the starting player: a fresh engine defaults to white, but
    # the first move record tells us who actually went first.
    if records:
        first_player_id = records[0].player_id
        if first_player_id == table.black_player_id:
            initial_state["current_turn"] = "black"

    record_dicts = [
        {
            "player_id": r.player_id,
            "dice_roll": r.dice_roll,
            "moves_notation": r.moves_notation,
            "move_number": r.move_number,
            "game_state_after": r.game_state_after,
        }
        for r in records
    ]

    # Analysis is CPU-bound (torch forward passes) — offload to a thread.
    analyses, ml_available, moves_analysed = await asyncio.to_thread(
        compute_analysis,
        initial_state,
        record_dicts,
        table.white_player_id,
        table.black_player_id,
        nickname_map,
        limit,
    )

    # --- Cache the result ---
    if cached is None:
        cached = GameAnalysis(
            table_id=table_id,
            move_analyses=analyses,
            ml_available=ml_available,
            moves_analysed=moves_analysed,
        )
        db.add(cached)
    else:
        cached.move_analyses = analyses
        cached.ml_available = ml_available
        cached.moves_analysed = moves_analysed
    await db.commit()

    return AnalysisResponse(
        table_id=table_id,
        ml_available=ml_available,
        moves_analysed=moves_analysed,
        total_moves=total_moves,
        move_analyses=[MoveAnalysis(**a) for a in analyses],
    )


@router.get("/tables/{table_id}/export")
async def export_game(
    table_id: str, db: AsyncSession = Depends(get_db)
) -> PlainTextResponse:
    """Export a completed game as a standard backgammon notation (.mat) file.

    Returns plain text in the widely-recognised match format::

        Player 1: WhitePlayer
        Player 2: BlackPlayer
        Match to 5 points

        Game 1
         1) 31: 8/5 6/5                     42: 24/20 13/11
         2) 64: 13/7 13/9                   53: 20/15 11/8
        ...
        WhitePlayer wins 2 points
    """
    table = await db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    white_player = await db.get(Player, table.white_player_id) if table.white_player_id else None
    black_player = await db.get(Player, table.black_player_id) if table.black_player_id else None

    records_result = await db.execute(
        select(MoveRecord)
        .where(MoveRecord.table_id == table_id)
        .order_by(MoveRecord.move_number)
    )
    records = records_result.scalars().all()

    white_name = white_player.nickname if white_player else "White"
    black_name = black_player.nickname if black_player else "Black"
    white_id = table.white_player_id
    black_id = table.black_player_id

    # Separate records by player colour while preserving chronological order.
    white_records = [r for r in records if r.player_id == white_id]
    black_records = [r for r in records if r.player_id == black_id]

    lines: list[str] = [
        f"Player 1: {white_name}",
        f"Player 2: {black_name}",
        f"Match to {table.match_points} points",
        "",
        "Game 1",
    ]

    max_turns = max(len(white_records), len(black_records))
    for i in range(max_turns):
        turn_num = i + 1
        white_rec = white_records[i] if i < len(white_records) else None
        black_rec = black_records[i] if i < len(black_records) else None

        white_part = ""
        if white_rec:
            dice = white_rec.dice_roll.replace("-", "")
            white_part = f"{dice}: {white_rec.moves_notation}"

        black_part = ""
        if black_rec:
            dice = black_rec.dice_roll.replace("-", "")
            black_part = f"{dice}: {black_rec.moves_notation}"

        # Left column is fixed-width so left/right turns are aligned.
        line = f" {turn_num}) {white_part:<34} {black_part}"
        lines.append(line.rstrip())

    if table.status == "finished" and table.winner_id:
        winner_name = white_name if table.winner_id == white_id else black_name
        score = table.final_score or 1
        point_word = "point" if score == 1 else "points"
        lines.append(f"{winner_name} wins {score} {point_word}")

    content = "\n".join(lines) + "\n"
    return PlainTextResponse(
        content=content,
        headers={
            "Content-Disposition": f'attachment; filename="game_{table_id}.mat"',
        },
    )


# ------------------------------------------------------------------
# Seasons
# ------------------------------------------------------------------


@router.get("/seasons/active", response_model=Optional[SeasonResponse])
async def get_active_season(db: AsyncSession = Depends(get_db)):
    """Return the currently active season, or null if none is active."""
    result = await db.execute(
        select(Season).where(Season.is_active.is_(True)).limit(1)
    )
    season = result.scalars().first()
    return season


# ------------------------------------------------------------------
# Leaderboard
# ------------------------------------------------------------------


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    metric: str = Query(default="wins", pattern="^(rating|wins|win_rate)$"),
    period: str = Query(default="all_time", pattern="^(all_time|month|week)$"),
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    viewer_id: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return leaderboard entries sorted by the chosen metric.

    metric=rating  – top players by ELO rating (min 5 rated games)
    metric=wins    – top players by total wins
    metric=win_rate – top players by win rate (min 10 games for all_time, 3 for
                      windowed periods since sample size is smaller)

    period=all_time (default) – uses PlayerStats aggregates
    period=month    – wins/games from Tables.finished_at within the last 30 days
    period=week     – wins/games from Tables.finished_at within the last 7 days

    ``viewer_id`` is an optional query parameter: when provided, the response
    includes a ``viewer_entry`` containing that player's leaderboard row even
    if they're outside the paginated window (useful for self-rank footer).

    Guest and bot accounts are always excluded.

    # Future: a ``friends_only=true`` filter will scope results to the viewer's
    # friends list once the friends system is implemented.
    """
    window_start: Optional[datetime] = None
    if period == "month":
        window_start = datetime.now(timezone.utc) - timedelta(days=30)
    elif period == "week":
        window_start = datetime.now(timezone.utc) - timedelta(days=7)

    # --- Build the stats subquery ------------------------------------------
    if window_start is None:
        # All-time: aggregate from PlayerStats (fast, pre-aggregated path).
        stats_sq = (
            select(
                PlayerStats.player_id,
                func.sum(PlayerStats.games_won).label("total_wins"),
                func.sum(PlayerStats.games_played).label("total_games"),
            )
            .group_by(PlayerStats.player_id)
            .subquery()
        )
        min_games_win_rate = 10
    else:
        # Windowed: aggregate directly from finished Tables.
        # Each finished table contributes 1 game to each participant and a win
        # to the winner_id.
        # Build two UNION ALL rows per table (one for each color), then group.
        white_rows = select(
            Table.white_player_id.label("player_id"),
            case((Table.winner_id == Table.white_player_id, 1), else_=0).label("is_win"),
        ).where(
            Table.status == "finished",
            Table.finished_at.is_not(None),
            Table.finished_at >= window_start,
            Table.white_player_id.is_not(None),
        )
        black_rows = select(
            Table.black_player_id.label("player_id"),
            case((Table.winner_id == Table.black_player_id, 1), else_=0).label("is_win"),
        ).where(
            Table.status == "finished",
            Table.finished_at.is_not(None),
            Table.finished_at >= window_start,
            Table.black_player_id.is_not(None),
        )
        union_sq = white_rows.union_all(black_rows).subquery()
        stats_sq = (
            select(
                union_sq.c.player_id.label("player_id"),
                func.sum(union_sq.c.is_win).label("total_wins"),
                func.count().label("total_games"),
            )
            .group_by(union_sq.c.player_id)
            .subquery()
        )
        # Lower threshold for windowed win_rate since sample sizes are smaller.
        min_games_win_rate = 3

    # For windowed periods, only include players who actually played in the
    # window (inner-join equivalent via WHERE). For all-time we keep the
    # existing outer-join behaviour so rating-only players still show up.
    if window_start is None:
        base_q = (
            select(
                Player.id,
                Player.nickname,
                Player.rating,
                Player.rating_games,
                func.coalesce(stats_sq.c.total_wins, 0).label("total_wins"),
                func.coalesce(stats_sq.c.total_games, 0).label("total_games"),
            )
            .outerjoin(stats_sq, Player.id == stats_sq.c.player_id)
            .where(Player.is_guest == False)  # noqa: E712
            .where(Player.id != BOT_PLAYER_ID)
        )
    else:
        base_q = (
            select(
                Player.id,
                Player.nickname,
                Player.rating,
                Player.rating_games,
                func.coalesce(stats_sq.c.total_wins, 0).label("total_wins"),
                func.coalesce(stats_sq.c.total_games, 0).label("total_games"),
            )
            .join(stats_sq, Player.id == stats_sq.c.player_id)
            .where(Player.is_guest == False)  # noqa: E712
            .where(Player.id != BOT_PLAYER_ID)
        )

    if metric == "rating":
        q = (
            base_q
            .where(Player.rating_games >= 5)
            .order_by(Player.rating.desc())
        )
    elif metric == "wins":
        q = base_q.order_by(func.coalesce(stats_sq.c.total_wins, 0).desc())
    else:  # win_rate
        q = (
            base_q
            .where(func.coalesce(stats_sq.c.total_games, 0) >= min_games_win_rate)
            .order_by(
                (func.coalesce(stats_sq.c.total_wins, 0) * 1.0
                 / stats_sq.c.total_games).desc()
            )
        )

    # Count total matching rows (before pagination)
    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar() or 0

    # Materialize all matching rows so we can locate viewer_id for a self-rank
    # footer even if they're outside the [offset, offset+limit) slice. This is
    # bounded by the leaderboard eligibility filters so stays small in practice.
    all_result = await db.execute(q)
    all_rows = all_result.all()

    def _make_entry(index: int, row) -> LeaderboardEntry:
        total_wins = int(row.total_wins)
        total_games = int(row.total_games)
        win_rate = (total_wins / total_games * 100.0) if total_games > 0 else 0.0
        return LeaderboardEntry(
            rank=index + 1,
            player_id=row.id,
            nickname=row.nickname,
            rating=row.rating,
            rating_games=row.rating_games,
            total_wins=total_wins,
            total_games=total_games,
            win_rate=win_rate,
        )

    page_rows = all_rows[offset : offset + limit]
    entries = [_make_entry(offset + i, row) for i, row in enumerate(page_rows)]

    viewer_entry: Optional[LeaderboardEntry] = None
    if viewer_id:
        for i, row in enumerate(all_rows):
            if row.id == viewer_id:
                # Only populate when viewer is NOT in the current page slice
                # (frontend already highlights the row when in view).
                if not (offset <= i < offset + limit):
                    viewer_entry = _make_entry(i, row)
                break

    return LeaderboardResponse(entries=entries, total=total, viewer_entry=viewer_entry)
