"""Daily and weekly challenge progress tracking.

Challenges are defined once in :mod:`app.models` (the :class:`Challenge`
table) and per-player progress is stored in :class:`PlayerChallenge`
rows keyed by a ``period_key`` ("YYYY-MM-DD" for daily, "YYYY-Www" for
weekly). When a game finishes, :func:`record_game_result` increments
progress on every matching active challenge; once a row's ``progress``
hits the template's ``target`` we stamp ``completed_at`` and credit
the reward to ``Player.challenge_points``.

Period rollover is implicit: :func:`get_active_player_challenges` upserts
a row for today's / this-week's key on demand. Previous periods live on
as historical rows but are no longer "active".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Challenge, Player, PlayerChallenge


# ---------------------------------------------------------------------------
# Period helpers
# ---------------------------------------------------------------------------


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


def daily_period_key(d: date | None = None) -> str:
    """ISO date string, e.g. ``2026-04-14``."""
    return (d or _today_utc()).isoformat()


def weekly_period_key(d: date | None = None) -> str:
    """ISO week string, e.g. ``2026-W15`` (Monday-based ISO week)."""
    d = d or _today_utc()
    year, week, _ = d.isocalendar()
    return f"{year:04d}-W{week:02d}"


def period_key_for(challenge_type: str, d: date | None = None) -> str:
    if challenge_type == "daily":
        return daily_period_key(d)
    if challenge_type == "weekly":
        return weekly_period_key(d)
    raise ValueError(f"Unknown challenge type: {challenge_type!r}")


# ---------------------------------------------------------------------------
# Game result payload
# ---------------------------------------------------------------------------


@dataclass
class GameResultMeta:
    """Minimal post-game payload driving challenge progress.

    ``win_type`` matches :class:`app.game_engine.WinType` names in lowercase
    (``"normal"`` / ``"gammon"`` / ``"backgammon"``).  ``bot_difficulty`` is
    the opponent bot's difficulty (``"easy"`` / ``"medium"`` / ``"hard"`` /
    ``"expert"``) when ``opponent_is_bot`` is True, otherwise ``None``.
    """

    won: bool
    win_type: str | None
    opponent_is_bot: bool
    bot_difficulty: str | None = None


# ---------------------------------------------------------------------------
# Metric matching
# ---------------------------------------------------------------------------


def _match_metric(metric: str, meta: GameResultMeta) -> int:
    """Return how much to increment for a given metric, given a game result.

    Unknown metrics return ``0`` so unrecognised seeds never accidentally
    credit progress.
    """
    if metric == "games":
        return 1
    if metric == "wins":
        return 1 if meta.won else 0
    if metric == "gammons":
        # Both gammon and backgammon count as a "scored gammon".
        return 1 if meta.won and meta.win_type in ("gammon", "backgammon") else 0
    if metric == "backgammons":
        return 1 if meta.won and meta.win_type == "backgammon" else 0
    if metric == "wins_vs_hard_bot":
        if (
            meta.won
            and meta.opponent_is_bot
            and (meta.bot_difficulty or "").lower() in ("hard", "expert")
        ):
            return 1
        return 0
    return 0


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------


async def _ensure_player_challenge_row(
    db: AsyncSession,
    player_id: str,
    challenge: Challenge,
) -> PlayerChallenge:
    """Fetch or create the PlayerChallenge row for today's period."""
    key = period_key_for(challenge.type)
    result = await db.execute(
        select(PlayerChallenge).where(
            PlayerChallenge.player_id == player_id,
            PlayerChallenge.challenge_id == challenge.id,
            PlayerChallenge.period_key == key,
        )
    )
    row = result.scalars().first()
    if row is not None:
        return row
    row = PlayerChallenge(
        player_id=player_id,
        challenge_id=challenge.id,
        period_key=key,
        progress=0,
        completed_at=None,
    )
    db.add(row)
    await db.flush()
    return row


async def _active_challenges(db: AsyncSession) -> list[Challenge]:
    result = await db.execute(
        select(Challenge).where(Challenge.is_active.is_(True))
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def record_game_result(
    db: AsyncSession,
    player_id: str,
    meta: GameResultMeta,
) -> list[str]:
    """Update challenge progress for ``player_id`` based on a finished game.

    Returns the list of challenge ids completed by this call (may be empty).
    The caller is responsible for committing the session.
    """
    player = await db.get(Player, player_id)
    if player is None or getattr(player, "is_guest", False):
        # Guests don't accumulate challenge progress.
        return []

    completed: list[str] = []
    challenges = await _active_challenges(db)
    for ch in challenges:
        delta = _match_metric(ch.metric, meta)
        if delta <= 0:
            continue
        row = await _ensure_player_challenge_row(db, player_id, ch)
        if row.completed_at is not None:
            # Already complete for this period — don't over-credit.
            continue
        row.progress = min(row.progress + delta, ch.target)
        if row.progress >= ch.target:
            row.completed_at = datetime.now(timezone.utc)
            player.challenge_points = (player.challenge_points or 0) + ch.reward_points
            completed.append(ch.id)
    return completed


async def get_active_player_challenges(
    db: AsyncSession,
    player_id: str,
) -> list[dict]:
    """Return the player's active daily + weekly challenges for the current
    period, upserting PlayerChallenge rows for any that don't yet exist.

    Each dict has: ``id``, ``name``, ``description``, ``type``, ``target``,
    ``metric``, ``reward_points``, ``progress``, ``completed_at`` (iso str or
    None), ``period_key``.
    """
    challenges = await _active_challenges(db)
    out: list[dict] = []
    for ch in challenges:
        row = await _ensure_player_challenge_row(db, player_id, ch)
        out.append(
            {
                "id": ch.id,
                "name": ch.name,
                "description": ch.description,
                "type": ch.type,
                "target": ch.target,
                "metric": ch.metric,
                "reward_points": ch.reward_points,
                "progress": row.progress,
                "completed_at": row.completed_at.isoformat() if row.completed_at else None,
                "period_key": row.period_key,
            }
        )
    # Daily first, then weekly, then alphabetical for stable ordering.
    out.sort(key=lambda r: (0 if r["type"] == "daily" else 1, r["id"]))
    return out


def iter_progress_deltas(
    challenges: Iterable[Challenge], meta: GameResultMeta
) -> list[tuple[str, int]]:
    """Pure helper: list of ``(challenge_id, delta)`` the given game triggers.

    Exposed for tests that want to sanity-check the metric matcher without
    touching the DB.
    """
    return [(c.id, _match_metric(c.metric, meta)) for c in challenges]
