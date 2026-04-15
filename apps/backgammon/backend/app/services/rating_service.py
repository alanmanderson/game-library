"""ELO rating service for ranked play.

Provides standard ELO calculation with K-factor adjustment based on
the number of games played. Only registered (non-guest, non-bot) players
have their ratings updated.
"""

import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Player, RatingHistory

logger = logging.getLogger(__name__)


def get_k_factor(games_played: int) -> int:
    """K-factor decreases as a player plays more rated games.

    - < 30 games:  K=40 (provisional, ratings move quickly)
    - 30-99 games: K=32 (standard)
    - 100+ games:  K=20 (established, ratings move slowly)
    """
    if games_played < 30:
        return 40
    elif games_played < 100:
        return 32
    else:
        return 20


def calculate_elo_change(
    winner_rating: int, loser_rating: int, k_factor: int = 32
) -> tuple[int, int]:
    """Calculate ELO rating changes for winner and loser.

    Uses the standard ELO formula:
      E_winner = 1 / (1 + 10^((loser_rating - winner_rating) / 400))
      winner_change = round(K * (1 - E_winner))
      loser_change  = round(K * (0 - E_loser))

    Returns (winner_change, loser_change) where winner_change >= 0
    and loser_change <= 0.
    """
    expected_winner = 1 / (1 + 10 ** ((loser_rating - winner_rating) / 400))
    expected_loser = 1 - expected_winner

    winner_change = round(k_factor * (1 - expected_winner))
    loser_change = round(k_factor * (0 - expected_loser))

    return winner_change, loser_change


async def update_ratings(
    db: AsyncSession,
    winner_id: Optional[str],
    loser_id: Optional[str],
    table_id: Optional[str] = None,
) -> Optional[tuple[int, int]]:
    """Update ELO ratings for both players after a completed game.

    Only updates ratings when both players are registered (non-guest,
    non-bot) players. Bot games and guest games are skipped.

    Returns (winner_change, loser_change) if ratings were updated,
    or None if the game was not rated.
    """
    from app.services.bot_service import BOT_PLAYER_ID

    if not winner_id or not loser_id:
        return None

    # Skip bot games
    if winner_id == BOT_PLAYER_ID or loser_id == BOT_PLAYER_ID:
        return None

    winner = await db.get(Player, winner_id)
    loser = await db.get(Player, loser_id)

    if not winner or not loser:
        return None

    # Skip games involving guest players
    if winner.is_guest or loser.is_guest:
        return None

    # Use the lower K-factor of the two players so the more
    # established player's rating doesn't swing too much.
    k_factor = min(get_k_factor(winner.rating_games), get_k_factor(loser.rating_games))

    winner_change, loser_change = calculate_elo_change(
        winner.rating, loser.rating, k_factor
    )

    winner.rating += winner_change
    winner.rating_games += 1

    loser.rating += loser_change
    loser.rating_games += 1

    # Floor rating at 100 to avoid negative or very low ratings
    if loser.rating < 100:
        loser.rating = 100

    # Persist rating history snapshots so dashboards can plot a rating graph.
    db.add(
        RatingHistory(
            player_id=winner.id,
            rating=winner.rating,
            rating_change=winner_change,
            opponent_id=loser.id,
            table_id=table_id,
        )
    )
    db.add(
        RatingHistory(
            player_id=loser.id,
            rating=loser.rating,
            rating_change=loser_change,
            opponent_id=winner.id,
            table_id=table_id,
        )
    )

    logger.info(
        "Rating update: %s (%d -> %d, +%d) beat %s (%d -> %d, %d)",
        winner.nickname,
        winner.rating - winner_change,
        winner.rating,
        winner_change,
        loser.nickname,
        loser.rating - loser_change,
        loser.rating,
        loser_change,
    )

    return winner_change, loser_change
