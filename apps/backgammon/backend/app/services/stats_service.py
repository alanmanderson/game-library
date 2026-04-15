"""Stats service for tracking and retrieving player statistics."""

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.models import PlayerStats, Player, Table, RatingHistory
from app.game_engine import WinType


async def update_stats(
    db: AsyncSession,
    white_player_id: str,
    black_player_id: str,
    winner_id: Optional[str],
    win_type: Optional[WinType],
    cube_value: int = 1,
) -> None:
    """Update PlayerStats for both players after a game.

    Creates stats records if they don't exist yet for a given player/opponent pair.
    Increments wins/losses and type-specific counters based on the game result.
    The score is multiplied by the doubling cube value.
    Skips stats for bot games.
    """
    from app.services.bot_service import BOT_PLAYER_ID
    if white_player_id == BOT_PLAYER_ID or black_player_id == BOT_PLAYER_ID:
        return

    score = (win_type.value if win_type else 1) * cube_value

    for player_id, opponent_id in [
        (white_player_id, black_player_id),
        (black_player_id, white_player_id),
    ]:
        result = await db.execute(
            select(PlayerStats).where(
                PlayerStats.player_id == player_id,
                PlayerStats.opponent_id == opponent_id,
            )
        )
        stats = result.scalar_one_or_none()

        if not stats:
            stats = PlayerStats(
                player_id=player_id,
                opponent_id=opponent_id,
                games_played=0,
                games_won=0,
                games_lost=0,
                total_points_won=0,
                total_points_lost=0,
                gammons_won=0,
                gammons_lost=0,
                backgammons_won=0,
                backgammons_lost=0,
            )
            db.add(stats)

        stats.games_played += 1

        if winner_id == player_id:
            stats.games_won += 1
            stats.total_points_won += score
            if win_type == WinType.GAMMON:
                stats.gammons_won += 1
            elif win_type == WinType.BACKGAMMON:
                stats.backgammons_won += 1
        else:
            stats.games_lost += 1
            stats.total_points_lost += score
            if win_type == WinType.GAMMON:
                stats.gammons_lost += 1
            elif win_type == WinType.BACKGAMMON:
                stats.backgammons_lost += 1


async def get_player_stats(db: AsyncSession, player_id: str) -> dict:
    """Get aggregated stats overview for a player across all opponents.

    Returns a dict matching the StatsOverview schema with per-opponent breakdowns.
    """
    result = await db.execute(
        select(PlayerStats).where(PlayerStats.player_id == player_id)
    )
    stats_list = result.scalars().all()

    total_games = sum(s.games_played for s in stats_list)
    total_wins = sum(s.games_won for s in stats_list)
    total_losses = sum(s.games_lost for s in stats_list)

    # Batch-load all opponents to avoid N+1 queries
    opponent_ids = {s.opponent_id for s in stats_list if s.opponent_id}
    if opponent_ids:
        opponents_result = await db.execute(
            select(Player).where(Player.id.in_(opponent_ids))
        )
        opponent_lookup = {p.id: p for p in opponents_result.scalars().all()}
    else:
        opponent_lookup = {}

    per_opponent = []
    for s in stats_list:
        opponent = opponent_lookup.get(s.opponent_id)
        per_opponent.append({
            "opponent_nickname": opponent.nickname if opponent else "Unknown",
            "games_played": s.games_played,
            "games_won": s.games_won,
            "games_lost": s.games_lost,
            "total_points_won": s.total_points_won,
            "total_points_lost": s.total_points_lost,
            "gammons_won": s.gammons_won,
            "gammons_lost": s.gammons_lost,
            "backgammons_won": s.backgammons_won,
            "backgammons_lost": s.backgammons_lost,
        })

    return {
        "total_games": total_games,
        "total_wins": total_wins,
        "total_losses": total_losses,
        "win_rate": (total_wins / total_games * 100) if total_games > 0 else 0.0,
        "per_opponent": per_opponent,
    }


async def get_advanced_stats(db: AsyncSession, player_id: str) -> dict:
    """Return the advanced stats payload for a player's dashboard.

    Includes gammon/backgammon rates, win rate per color, win rate per
    time control, cube action counts, and an ELO rating history series.
    All derivations use only completed games (``status='finished'`` with
    a winner) so abandoned games don't skew the percentages.
    """
    player = await db.get(Player, player_id)

    # Aggregate gammon / backgammon counts from PlayerStats (already tracked).
    stats_result = await db.execute(
        select(PlayerStats).where(PlayerStats.player_id == player_id)
    )
    stats_list = stats_result.scalars().all()
    gammon_wins = sum(s.gammons_won for s in stats_list)
    gammon_losses = sum(s.gammons_lost for s in stats_list)
    backgammon_wins = sum(s.backgammons_won for s in stats_list)
    backgammon_losses = sum(s.backgammons_lost for s in stats_list)
    total_wins = sum(s.games_won for s in stats_list)

    # Per-color + per-time-control win rates come from the tables table.
    tables_result = await db.execute(
        select(Table).where(
            or_(
                Table.white_player_id == player_id,
                Table.black_player_id == player_id,
            ),
            Table.status == "finished",
            Table.winner_id.is_not(None),
        )
    )
    tables = tables_result.scalars().all()

    white_games = 0
    white_wins = 0
    black_games = 0
    black_wins = 0
    by_tc: dict[str, dict[str, int]] = {}

    for t in tables:
        won = t.winner_id == player_id
        if t.white_player_id == player_id:
            white_games += 1
            if won:
                white_wins += 1
        else:
            black_games += 1
            if won:
                black_wins += 1

        tc = t.time_control or "unlimited"
        bucket = by_tc.setdefault(tc, {"games": 0, "wins": 0})
        bucket["games"] += 1
        if won:
            bucket["wins"] += 1

    def _rate(wins: int, games: int) -> float:
        return (wins / games * 100.0) if games > 0 else 0.0

    time_control_map = {
        tc: {
            "games": b["games"],
            "wins": b["wins"],
            "win_rate": _rate(b["wins"], b["games"]),
        }
        for tc, b in by_tc.items()
    }

    # Cube stats from Player counters.
    cube_offers = getattr(player, "cube_offers", 0) if player else 0
    cube_accepts = getattr(player, "cube_accepts", 0) if player else 0
    cube_declines = getattr(player, "cube_declines", 0) if player else 0
    accept_denom = cube_accepts + cube_declines
    accept_rate = (cube_accepts / accept_denom * 100.0) if accept_denom > 0 else 0.0

    # Rating history, chronological.
    rh_result = await db.execute(
        select(RatingHistory)
        .where(RatingHistory.player_id == player_id)
        .order_by(RatingHistory.created_at.asc())
    )
    rating_history = [
        {
            "played_at": r.created_at,
            "rating_after": r.rating,
            "rating_change": r.rating_change,
        }
        for r in rh_result.scalars().all()
    ]

    total_games = white_games + black_games

    return {
        "total_games": total_games,
        "gammon_wins": gammon_wins,
        "gammon_losses": gammon_losses,
        "gammon_rate": _rate(gammon_wins, total_wins),
        "backgammon_wins": backgammon_wins,
        "backgammon_losses": backgammon_losses,
        "backgammon_rate": _rate(backgammon_wins, total_wins),
        "win_rate_as_white": {
            "games": white_games,
            "wins": white_wins,
            "win_rate": _rate(white_wins, white_games),
        },
        "win_rate_as_black": {
            "games": black_games,
            "wins": black_wins,
            "win_rate": _rate(black_wins, black_games),
        },
        "win_rate_by_time_control": time_control_map,
        "cube_stats": {
            "offered": cube_offers,
            "accepted": cube_accepts,
            "declined": cube_declines,
            "accept_rate": accept_rate,
        },
        "rating_history": rating_history,
    }
