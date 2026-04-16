"""Well-known bot users with deterministic UUIDs.

Each bot occupies a fixed seat. The `get_or_create_bots` helper is idempotent
and safe to call from any request path.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

BOT_UUIDS: dict[str, uuid.UUID] = {
    "NORTH": uuid.UUID("b07b0700-0000-4000-a000-000000000001"),
    "EAST": uuid.UUID("b07b0700-0000-4000-a000-000000000002"),
    "SOUTH": uuid.UUID("b07b0700-0000-4000-a000-000000000003"),
    "WEST": uuid.UUID("b07b0700-0000-4000-a000-000000000004"),
}

BOT_NAMES: dict[str, str] = {
    "NORTH": "Bot (North)",
    "EAST": "Bot (East)",
    "SOUTH": "Bot (South)",
    "WEST": "Bot (West)",
}

ALL_BOT_IDS: set[uuid.UUID] = set(BOT_UUIDS.values())


def is_bot_user(user_id: uuid.UUID) -> bool:
    """Return True if this user_id belongs to a bot."""
    return user_id in ALL_BOT_IDS


async def get_or_create_bots(db: AsyncSession) -> dict[str, uuid.UUID]:
    """Ensure bot User rows exist in the database. Returns {seat: user_id} map.

    Idempotent: safe to call multiple times within a session.
    """
    for seat, bot_id in BOT_UUIDS.items():
        result = await db.execute(select(User).where(User.id == bot_id))
        if result.scalar_one_or_none() is None:
            bot = User(
                id=bot_id,
                username=f"bot_{seat.lower()}",
                first_name=BOT_NAMES[seat],
                last_name="",
                email=None,
                password_hash=None,
            )
            db.add(bot)
    await db.flush()
    return dict(BOT_UUIDS)
