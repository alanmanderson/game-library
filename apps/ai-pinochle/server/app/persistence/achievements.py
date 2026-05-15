"""Achievement catalog, persistence, and evaluation logic.

All public functions are best-effort — callers should wrap them in try/except
so a DB failure never breaks the live game flow.
"""
import logging
import uuid

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.achievement import UserAchievement
from app.models.game import Game

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------

ACHIEVEMENTS: dict[str, dict] = {
    "shoot_the_moon": {
        "name": "Shoot the Moon",
        "description": "Successfully bid and win every trick",
        "rarity": "EPIC",
    },
    "set_the_bid": {
        "name": "Set the Bid",
        "description": "Stop the bidding team from making their bid",
        "rarity": "RARE",
    },
    "pinochle": {
        "name": "Pinochle!",
        "description": "Score a Pinochle meld (J\u2666 + Q\u2660) in a hand",
        "rarity": "COMMON",
    },
    "double_aces_around": {
        "name": "Double Aces Around",
        "description": "Score a Double Aces Around meld",
        "rarity": "LEGENDARY",
    },
    "meld_sixty_plus": {
        "name": "Meld Master",
        "description": "Your team scores 60 or more meld points in one hand",
        "rarity": "EPIC",
    },
    "first_win": {
        "name": "First Victory",
        "description": "Win your first game of Pinochle",
        "rarity": "COMMON",
    },
    "ten_wins": {
        "name": "Veteran",
        "description": "Win 10 games of Pinochle",
        "rarity": "RARE",
    },
}

# ---------------------------------------------------------------------------
# Seat / team helpers (kept local to avoid circular imports)
# ---------------------------------------------------------------------------

_SEAT_COLS: dict[str, str] = {
    "NORTH": "north_player_id",
    "EAST": "east_player_id",
    "SOUTH": "south_player_id",
    "WEST": "west_player_id",
}

_TEAM_FOR_SEAT: dict[str, str] = {
    "NORTH": "NS",
    "SOUTH": "NS",
    "EAST": "EW",
    "WEST": "EW",
}


def _seats_for_team(team: str) -> list[str]:
    return [s for s, t in _TEAM_FOR_SEAT.items() if t == team]


def _user_id_for_seat(game: Game, seat: str) -> uuid.UUID | None:
    col = _SEAT_COLS.get(seat)
    return getattr(game, col, None) if col else None


# ---------------------------------------------------------------------------
# Core unlock primitive
# ---------------------------------------------------------------------------


async def try_unlock(
    db: AsyncSession,
    user_id: uuid.UUID,
    key: str,
    game_id: uuid.UUID | None = None,
) -> dict | None:
    """Insert an achievement row inside a savepoint.

    Returns the achievement metadata dict if newly unlocked, None if the user
    already has the achievement.  Uses a nested savepoint so an IntegrityError
    from a race condition rolls back only to the savepoint, leaving the outer
    transaction intact.
    """
    # Fast-path: check before attempting the insert to avoid savepoint overhead
    # on the common case where the achievement already exists.
    existing = await db.execute(
        select(UserAchievement.id).where(
            UserAchievement.user_id == user_id,
            UserAchievement.achievement_key == key,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return None

    try:
        async with db.begin_nested():
            db.add(UserAchievement(user_id=user_id, achievement_key=key, game_id=game_id))
            await db.flush()
    except IntegrityError:
        # Race condition: another process inserted between our check and insert.
        # The savepoint is rolled back; the outer transaction is unaffected.
        return None

    return ACHIEVEMENTS.get(key)


# ---------------------------------------------------------------------------
# Hand-level evaluation
# ---------------------------------------------------------------------------


async def check_hand_achievements(
    db: AsyncSession,
    game: Game,
    state: dict,
    sfx: dict,
) -> list[tuple[uuid.UUID, dict]]:
    """Evaluate hand-level achievements.

    Returns a list of (user_id, achievement_meta) for newly unlocked achievements.
    """
    results: list[tuple[uuid.UUID, dict]] = []
    hand = state.get("current_hand", {})
    bidding = hand.get("bidding", {})
    bidding_team: str | None = sfx.get("bidding_team")
    score_deltas: dict = sfx.get("score_deltas", {})
    team_meld: dict = sfx.get("team_meld", {})
    # {seat: {melds: [{name, cards, points}], total}}
    player_melds: dict = hand.get("player_melds", {})

    # 1. Shoot the Moon — bidding team made it AND is_shoot_the_moon flag set.
    if bidding.get("is_shoot_the_moon") and score_deltas.get(bidding_team, 0) > 0:
        for seat in _seats_for_team(bidding_team):
            uid = _user_id_for_seat(game, seat)
            if uid:
                ach = await try_unlock(db, uid, "shoot_the_moon", game.id)
                if ach:
                    results.append((uid, ach))

    # 2. Set the Bid — defending team when the bidding team was set.
    if bidding_team and score_deltas.get(bidding_team, 0) < 0:
        defending = "EW" if bidding_team == "NS" else "NS"
        for seat in _seats_for_team(defending):
            uid = _user_id_for_seat(game, seat)
            if uid:
                ach = await try_unlock(db, uid, "set_the_bid", game.id)
                if ach:
                    results.append((uid, ach))

    # 3. Pinochle meld — any player who scored a Pinochle or Double Pinochle.
    for seat, meld_data in player_melds.items():
        meld_names = [m["name"] for m in meld_data.get("melds", [])]
        if "Pinochle" in meld_names or "Double Pinochle" in meld_names:
            uid = _user_id_for_seat(game, seat)
            if uid:
                ach = await try_unlock(db, uid, "pinochle", game.id)
                if ach:
                    results.append((uid, ach))

    # 4. Double Aces Around — any player who has it.
    for seat, meld_data in player_melds.items():
        meld_names = [m["name"] for m in meld_data.get("melds", [])]
        if "Double Aces Around" in meld_names:
            uid = _user_id_for_seat(game, seat)
            if uid:
                ach = await try_unlock(db, uid, "double_aces_around", game.id)
                if ach:
                    results.append((uid, ach))

    # 5. Meld Master — team scored 60+ meld points.
    for team in ("NS", "EW"):
        if team_meld.get(team, 0) >= 60:
            for seat in _seats_for_team(team):
                uid = _user_id_for_seat(game, seat)
                if uid:
                    ach = await try_unlock(db, uid, "meld_sixty_plus", game.id)
                    if ach:
                        results.append((uid, ach))

    return results


# ---------------------------------------------------------------------------
# Game-level evaluation
# ---------------------------------------------------------------------------


async def check_game_achievements(
    db: AsyncSession,
    game: Game,
    state: dict,
) -> list[tuple[uuid.UUID, dict]]:
    """Evaluate game-level achievements.

    Returns a list of (user_id, achievement_meta) for newly unlocked achievements.
    """
    results: list[tuple[uuid.UUID, dict]] = []
    winner_team: str | None = state.get("winner_team")
    if not winner_team:
        return results

    for seat in _seats_for_team(winner_team):
        uid = _user_id_for_seat(game, seat)
        if not uid:
            continue

        first = await try_unlock(db, uid, "first_win", None)
        if first:
            results.append((uid, first))

        win_count = await _count_wins(db, uid)
        if win_count >= 10:
            ten = await try_unlock(db, uid, "ten_wins", None)
            if ten:
                results.append((uid, ten))

    return results


async def _count_wins(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Count completed games won by this user.

    Uses populate_existing=True so the query bypasses SQLAlchemy's identity-map
    cache and reads the current DB state — important because save_game_state
    uses a raw UPDATE (not ORM flush) to stamp status=COMPLETED, leaving stale
    objects in the cache that would otherwise exclude the just-finished game.
    """
    result = await db.execute(
        select(Game)
        .where(
            Game.status == "COMPLETED",
            or_(
                Game.north_player_id == user_id,
                Game.east_player_id == user_id,
                Game.south_player_id == user_id,
                Game.west_player_id == user_id,
            ),
        )
        .execution_options(populate_existing=True)
    )
    games = result.scalars().all()
    wins = 0
    for g in games:
        winner = (g.current_state_json or {}).get("winner_team")
        if not winner:
            continue
        for seat, col in _SEAT_COLS.items():
            if getattr(g, col) == user_id:
                if _TEAM_FOR_SEAT[seat] == winner:
                    wins += 1
                break
    return wins


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------


async def get_user_achievements(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> list[dict]:
    """Return all unlocked achievements for a user with full catalog metadata."""
    result = await db.execute(
        select(UserAchievement)
        .where(UserAchievement.user_id == user_id)
        .order_by(UserAchievement.unlocked_at.asc())
    )
    rows = result.scalars().all()
    out = []
    for row in rows:
        meta = ACHIEVEMENTS.get(row.achievement_key, {})
        out.append({
            "achievement_key": row.achievement_key,
            "name": meta.get("name", row.achievement_key),
            "description": meta.get("description", ""),
            "rarity": meta.get("rarity", "COMMON"),
            "game_id": str(row.game_id) if row.game_id else None,
            "unlocked_at": row.unlocked_at.isoformat(),
        })
    return out
