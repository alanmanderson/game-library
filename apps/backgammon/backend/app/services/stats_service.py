"""Stats service for tracking and retrieving player statistics."""

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import PlayerStats, Player
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
