"""Bot service for playing against a random-move AI opponent."""

import asyncio
import logging
import random

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Player
from app.game_engine import GameStatus

logger = logging.getLogger(__name__)

BOT_PLAYER_ID = "BOT"
BOT_NICKNAME = "Bot"

# Delay between bot actions (seconds) for UX
BOT_MOVE_DELAY = 0.6
BOT_ROLL_DELAY = 0.8


async def ensure_bot_player(db: AsyncSession) -> Player:
    """Create the bot Player row if it doesn't exist. Returns the bot player."""
    bot = await db.get(Player, BOT_PLAYER_ID)
    if bot is None:
        bot = Player(
            id=BOT_PLAYER_ID,
            nickname=BOT_NICKNAME,
            is_guest=True,
            auth_provider="bot",
        )
        db.add(bot)
        await db.flush()
    return bot


def is_bot_player(player_id: str) -> bool:
    """Check if a player ID is the bot."""
    return player_id == BOT_PLAYER_ID


def is_bot_game(table_id: str) -> bool:
    """Check if a table has the bot as one of its players."""
    from app.services.game_service import game_manager
    colors = game_manager._player_colors.get(table_id, {})
    return BOT_PLAYER_ID in colors


def get_bot_color(table_id: str):
    """Return the Color assigned to the bot at this table, or None."""
    from app.services.game_service import game_manager
    return game_manager.get_player_color(table_id, BOT_PLAYER_ID)


def is_bot_turn(table_id: str) -> bool:
    """Check if it's currently the bot's turn."""
    from app.services.game_service import game_manager
    engine = game_manager.get_engine(table_id)
    if not engine:
        return False
    bot_color = get_bot_color(table_id)
    if not bot_color:
        return False
    return engine.state.current_turn == bot_color


async def execute_bot_turn(table_id: str) -> None:
    """Execute the bot's full turn: roll, make random moves, end turn.

    This runs as an independent asyncio task and acquires the per-table lock
    for each action to avoid deadlocks with the WebSocket handler.
    Each action broadcasts state to connected players.
    """
    from app.services.game_service import game_manager
    from app.api.websocket import _send_game_state_to_all, manager
    from app.database import async_session

    try:
        # Small delay before bot starts its turn for UX
        await asyncio.sleep(BOT_ROLL_DELAY)

        # --- Handle double offered to bot (auto-accept) ---
        async with game_manager._get_lock(table_id):
            engine = game_manager.get_engine(table_id)
            if not engine:
                return
            if engine.state.double_offered and engine.state.double_offered_by != get_bot_color(table_id):
                async with async_session() as db:
                    await game_manager.accept_double(db, table_id, BOT_PLAYER_ID)
                    await db.commit()
                    await _send_game_state_to_all(table_id, db=db)

        # --- Roll dice (if in ROLLING phase) ---
        bot_color = get_bot_color(table_id)
        async with game_manager._get_lock(table_id):
            engine = game_manager.get_engine(table_id)
            if not engine or engine.state.status == GameStatus.FINISHED:
                return
            if not bot_color or engine.state.current_turn != bot_color:
                return

            if engine.state.status == GameStatus.ROLLING:
                async with async_session() as db:
                    roll = await game_manager.roll_dice(db, table_id, BOT_PLAYER_ID)
                    await db.commit()
                    # Send dice_rolled to human players
                    for pid in manager.get_player_ids(table_id):
                        await manager.send_to_player(table_id, pid, {
                            "type": "dice_rolled", "data": roll
                        })
                    await _send_game_state_to_all(table_id, db=db)

        # Check if turn was auto-skipped (no valid moves after roll)
        engine = game_manager.get_engine(table_id)
        if not engine or engine.state.status == GameStatus.FINISHED:
            return
        if engine.state.current_turn != bot_color:
            # Turn was auto-skipped, nothing more to do
            return

        # --- Make moves ---
        while True:
            await asyncio.sleep(BOT_MOVE_DELAY)

            async with game_manager._get_lock(table_id):
                engine = game_manager.get_engine(table_id)
                if not engine or engine.state.status == GameStatus.FINISHED:
                    return
                if engine.state.current_turn != bot_color:
                    return  # Turn ended (auto-switched)

                if engine.state.status != GameStatus.MOVING:
                    return

                valid_moves = engine.get_valid_moves()
                if not valid_moves:
                    # No valid moves — end turn explicitly
                    async with async_session() as db:
                        try:
                            await game_manager.end_turn(db, table_id, BOT_PLAYER_ID)
                        except ValueError:
                            pass  # Turn may have already ended
                        await db.commit()
                        await _send_game_state_to_all(table_id, db=db)
                    return

                # Pick a random move
                move = random.choice(valid_moves)
                async with async_session() as db:
                    state_snapshot = engine.get_state_snapshot()
                    try:
                        await game_manager.make_move(
                            db, table_id, BOT_PLAYER_ID,
                            move.from_point, move.to_point,
                        )
                    except (ValueError, Exception) as e:
                        logger.warning("Bot move failed for table %s: %s", table_id, e)
                        await game_manager.restore_engine_from_snapshot(
                            table_id, engine, state_snapshot
                        )
                        return

                    await db.commit()
                    await _send_game_state_to_all(table_id, db=db)

                    # Check for game over
                    if engine.state.status == GameStatus.FINISHED:
                        from app.models import Table
                        table = await db.get(Table, table_id)
                        if table:
                            game_over_data = {
                                "winner_id": table.winner_id,
                                "win_type": table.win_type,
                                "final_score": table.final_score,
                            }
                            for pid in manager.get_player_ids(table_id):
                                await manager.send_to_player(
                                    table_id, pid,
                                    {"type": "game_over", "data": game_over_data},
                                )
                        game_manager.cleanup_finished_game(table_id)
                        return

    except Exception:
        logger.exception("Error during bot turn for table %s", table_id)


def schedule_bot_turn_if_needed(table_id: str) -> None:
    """Schedule a bot turn as an asyncio task if it's the bot's turn."""
    if is_bot_game(table_id) and is_bot_turn(table_id):
        asyncio.create_task(execute_bot_turn(table_id))


def schedule_bot_double_response_if_needed(table_id: str) -> None:
    """Schedule bot to respond to a double offer."""
    from app.services.game_service import game_manager
    engine = game_manager.get_engine(table_id)
    if not engine or not is_bot_game(table_id):
        return
    bot_color = get_bot_color(table_id)
    if not bot_color:
        return
    # If a double was offered and it's NOT from the bot, the bot needs to respond
    if engine.state.double_offered and engine.state.double_offered_by != bot_color:
        asyncio.create_task(execute_bot_turn(table_id))
