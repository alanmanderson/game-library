"""Helpers for loading/saving game state with optimistic concurrency control.

Every state-mutating WS handler does:

    game = await load_game(db, room_code)
    state = copy.deepcopy(game.current_state_json or {})
    # ... mutate state ...
    await save_game_state(db, game, state)  # raises OptimisticLockError on conflict

The check is `UPDATE games SET current_state_json = :s, version = version + 1
WHERE id = :id AND version = :expected`. If 0 rows affected, the row was
modified by another writer between our read and our write — we raise rather
than silently lose the update. The caller's room-level asyncio.Lock makes
this collision rare in single-instance, but the version column also defends
against bypass paths (REST, multi-process, etc.).
"""
import logging

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game import Game

logger = logging.getLogger(__name__)


class OptimisticLockError(Exception):
    """Raised when a versioned UPDATE affects 0 rows (someone else wrote first)."""


async def save_game_state(
    db: AsyncSession,
    game: Game,
    state: dict,
    *,
    extra: dict | None = None,
) -> None:
    """Persist `state` and bump version, asserting the row hasn't moved.

    `extra` lets callers update sibling columns (status, ended_at, scores) in
    the same conditional UPDATE so the version bump covers them too.
    """
    expected_version = game.version
    values = {"current_state_json": state, "version": expected_version + 1}
    if extra:
        values.update(extra)

    result = await db.execute(
        update(Game)
        .where(Game.id == game.id, Game.version == expected_version)
        .values(**values)
    )
    if result.rowcount == 0:
        raise OptimisticLockError(
            f"game {game.id} version {expected_version} stale on write"
        )

    # Reflect new state on the in-memory ORM object so callers can read back.
    game.current_state_json = state
    game.version = expected_version + 1
    if extra:
        for k, v in extra.items():
            setattr(game, k, v)
