"""Per-player per-season statistics upsert and retrieval.

Complements :mod:`app.services.rating_service`: whenever a rated match
finishes between two registered human players, this module upserts one
``PlayerSeasonStats`` row per participant for the currently active
season, so the Dashboard can show a history of completed seasons.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.game_engine import WinType
from app.models import Player, PlayerSeasonStats, Season
from app.tiers import tier_for_rating

logger = logging.getLogger(__name__)


async def _get_active_season(db: AsyncSession) -> Optional[Season]:
    result = await db.execute(select(Season).where(Season.is_active.is_(True)))
    return result.scalars().first()


async def _get_or_create_row(
    db: AsyncSession, player: Player, season_id: int
) -> PlayerSeasonStats:
    result = await db.execute(
        select(PlayerSeasonStats).where(
            PlayerSeasonStats.player_id == player.id,
            PlayerSeasonStats.season_id == season_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is not None:
        return row
    row = PlayerSeasonStats(
        player_id=player.id,
        season_id=season_id,
        end_rating=player.rating,
        peak_rating=player.rating,
        wins=0,
        losses=0,
        gammons_won=0,
        gammons_lost=0,
        tier_final=tier_for_rating(player.rating),
        games_played=0,
    )
    db.add(row)
    return row


async def record_match_result(
    db: AsyncSession,
    winner_id: Optional[str],
    loser_id: Optional[str],
    win_type: Optional[WinType],
) -> None:
    """Upsert PlayerSeasonStats for both participants of a finished match.

    Must be called AFTER ratings have been updated so ``player.rating``
    reflects the post-match value. Silently skips the call (logs at
    exception level) if anything goes wrong — season history is purely
    derived data and must never block game finalization.

    Ignores:
      - games with no winner_id/loser_id (shouldn't happen for ranked
        finalizations but we're defensive),
      - games involving the bot or guests (these are never rated anyway,
        so ``update_ratings`` skips them too).
    """
    from app.services.bot_service import BOT_PLAYER_ID

    if not winner_id or not loser_id:
        return
    if winner_id == BOT_PLAYER_ID or loser_id == BOT_PLAYER_ID:
        return

    try:
        season = await _get_active_season(db)
        if season is None:
            return

        winner = await db.get(Player, winner_id)
        loser = await db.get(Player, loser_id)
        if not winner or not loser:
            return
        if winner.is_guest or loser.is_guest:
            return

        now = datetime.now(timezone.utc)

        winner_row = await _get_or_create_row(db, winner, season.id)
        winner_row.wins += 1
        winner_row.games_played += 1
        winner_row.end_rating = winner.rating
        if winner.rating > winner_row.peak_rating:
            winner_row.peak_rating = winner.rating
        if win_type == WinType.GAMMON or win_type == WinType.BACKGAMMON:
            winner_row.gammons_won += 1
        winner_row.tier_final = tier_for_rating(winner_row.end_rating)
        winner_row.updated_at = now

        loser_row = await _get_or_create_row(db, loser, season.id)
        loser_row.losses += 1
        loser_row.games_played += 1
        loser_row.end_rating = loser.rating
        if loser.rating > loser_row.peak_rating:
            loser_row.peak_rating = loser.rating
        if win_type == WinType.GAMMON or win_type == WinType.BACKGAMMON:
            loser_row.gammons_lost += 1
        loser_row.tier_final = tier_for_rating(loser_row.end_rating)
        loser_row.updated_at = now
    except Exception:
        # Season bookkeeping is best-effort; never block a game finalize.
        logger.exception(
            "Failed to record season stats for %s vs %s", winner_id, loser_id
        )


async def get_season_history(db: AsyncSession, player_id: str) -> list[dict]:
    """Return the player's PlayerSeasonStats joined with Season metadata.

    Ordered with the active / most recent season first.
    """
    result = await db.execute(
        select(PlayerSeasonStats, Season)
        .join(Season, PlayerSeasonStats.season_id == Season.id)
        .where(PlayerSeasonStats.player_id == player_id)
        .order_by(Season.is_active.desc(), Season.start_date.desc())
    )
    out: list[dict] = []
    for row, season in result.all():
        out.append(
            {
                "season_id": season.id,
                "season_name": season.name,
                "start_date": season.start_date,
                "end_date": season.end_date,
                "is_active": season.is_active,
                "end_rating": row.end_rating,
                "peak_rating": row.peak_rating,
                "wins": row.wins,
                "losses": row.losses,
                "gammons_won": row.gammons_won,
                "gammons_lost": row.gammons_lost,
                "tier_final": row.tier_final,
                "games_played": row.games_played,
                "updated_at": row.updated_at,
            }
        )
    return out
