"""Bot service for playing against an AI opponent with configurable difficulty.

Difficulty levels:
  - easy: Random valid moves
  - medium: Heuristic-based move scoring
  - hard: ML neural network (backgammon_model_final.pt)
  - expert: V2 neural network with bearoff DB (v2_model.pt)
"""

import asyncio
import logging
import os
import random
import sys

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

# --- Difficulty tracking (in-memory, per table) ---
_table_difficulties: dict[str, str] = {}


def set_bot_difficulty(table_id: str, difficulty: str) -> None:
    """Store the bot difficulty for a table."""
    _table_difficulties[table_id] = difficulty


def get_bot_difficulty(table_id: str) -> str:
    """Get the bot difficulty for a table (defaults to 'hard')."""
    return _table_difficulties.get(table_id, "hard")


async def restore_bot_difficulty(table_id: str, db: AsyncSession) -> None:
    """Restore bot difficulty from the database (after server restart)."""
    if table_id in _table_difficulties:
        return
    from app.models import Table
    table = await db.get(Table, table_id)
    if table and table.bot_difficulty:
        _table_difficulties[table_id] = table.bot_difficulty


# --- ML Model Integration ---
_ml_bot = None
_ml_v2_bot = None


def _find_ml_dir():
    """Find the ml/ directory. Returns the path or None."""
    candidates = [
        os.path.join('/app', 'ml'),
        os.path.join(os.path.dirname(__file__), '..', '..', '..', 'ml'),
    ]
    for candidate in candidates:
        if os.path.isdir(candidate):
            return candidate
    return None


def _load_ml_bot():
    """Lazily load the standard ML bot player. Returns None if unavailable."""
    global _ml_bot
    if _ml_bot is not None:
        return _ml_bot

    try:
        ml_dir = _find_ml_dir()
        if ml_dir is None:
            return None

        model_path = os.path.join(ml_dir, 'models', 'backgammon_model_final.pt')
        if not os.path.exists(model_path):
            logger.info("ML model not found at %s, using random moves", model_path)
            return None

        if ml_dir not in sys.path:
            sys.path.insert(0, ml_dir)
        from bot_integration import MLBotPlayer
        _ml_bot = MLBotPlayer(model_path)
        logger.info("ML bot (hard) loaded from %s", model_path)
        return _ml_bot
    except (FileNotFoundError, OSError, ImportError) as e:
        logger.warning("Failed to load ML bot: %s", e)
        return None


def _load_v2_bot():
    """Lazily load the V2 ML bot (expert) with bearoff DB."""
    global _ml_v2_bot
    if _ml_v2_bot is not None:
        return _ml_v2_bot
    try:
        ml_dir = _find_ml_dir()
        if ml_dir is None:
            return None
        models_dir = os.path.join(ml_dir, 'models')
        model_path = os.path.join(models_dir, 'v2_model.pt')
        bearoff_path = os.path.join(models_dir, 'bearoff.npz')
        if not os.path.exists(model_path):
            logger.info("V2 model not found at %s", model_path)
            return None
        if ml_dir not in sys.path:
            sys.path.insert(0, ml_dir)
        from bot_integration import MLBotPlayerV2
        _ml_v2_bot = MLBotPlayerV2(
            single_model_path=model_path,
            bearoff_db_path=bearoff_path if os.path.exists(bearoff_path) else None,
        )
        logger.info("V2 bot (expert) loaded, bearoff DB: %s", os.path.exists(bearoff_path))
        return _ml_v2_bot
    except (FileNotFoundError, OSError, ImportError) as e:
        logger.warning("Failed to load V2 bot: %s", e)
        return None


def _heuristic_score_move(engine, move):
    """Score a move using heuristic rules. Higher is better."""
    score = 0.0
    # Prefer hitting opponent checkers
    if move.is_hit:
        score += 3.0
    # Prefer bearing off
    if move.to_point == 0 or move.to_point == 25:
        score += 4.0
    # Prefer escaping from the bar
    from_bar = move.from_point == 0 or move.from_point == 25
    if from_bar:
        score += 2.0
    # Prefer making points (landing where we already have one checker)
    board = engine.state.points
    bot_color = engine.state.current_turn
    if 1 <= move.to_point <= 24:
        val = board[move.to_point]
        if bot_color.value == "white" and val == 1:
            score += 2.5  # Making a point
        elif bot_color.value == "black" and val == -1:
            score += 2.5
    # Avoid leaving blots (single checkers)
    if 1 <= move.from_point <= 24:
        val = board[move.from_point]
        if bot_color.value == "white" and val == 1:
            score -= 1.0  # Leaving a blot behind
        elif bot_color.value == "black" and val == -1:
            score -= 1.0
    # Small random jitter to break ties
    score += random.random() * 0.1
    return score


def _select_bot_move(engine, valid_moves, table_id: str = ""):
    """Select a move based on the table's difficulty setting."""
    difficulty = get_bot_difficulty(table_id)

    if difficulty == "easy":
        return random.choice(valid_moves)

    if difficulty == "medium":
        return max(valid_moves, key=lambda m: _heuristic_score_move(engine, m))

    if difficulty == "expert":
        v2_bot = _load_v2_bot()
        if v2_bot is not None:
            try:
                move = v2_bot.select_move(engine)
                if move is not None:
                    return move
            except (ValueError, IndexError, KeyError) as e:
                logger.warning("V2 expert move selection failed: %s", e)
        # Fall through to hard if V2 unavailable

    # Default: hard (ML model)
    ml_bot = _load_ml_bot()
    if ml_bot is not None:
        try:
            move = ml_bot.select_move(engine)
            if move is not None:
                return move
        except (ValueError, IndexError, KeyError) as e:
            logger.warning("ML move selection failed: %s", e)
    return random.choice(valid_moves)


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
    """Execute the bot's full turn: roll, make moves, end turn.

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
                should_accept = True
                difficulty = get_bot_difficulty(table_id)
                if difficulty == "expert":
                    v2_bot = _load_v2_bot()
                    if v2_bot is not None:
                        try:
                            should_accept = v2_bot.should_accept_double(engine)
                        except (ValueError, IndexError, KeyError):
                            pass
                elif difficulty == "hard":
                    ml_bot = _load_ml_bot()
                    if ml_bot is not None:
                        try:
                            should_accept = ml_bot.should_accept_double(engine)
                        except (ValueError, IndexError, KeyError):
                            pass
                async with async_session() as db:
                    if should_accept:
                        await game_manager.accept_double(db, table_id, BOT_PLAYER_ID)
                    else:
                        await game_manager.decline_double(db, table_id, BOT_PLAYER_ID)
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

                # Pick the best move based on difficulty
                move = _select_bot_move(engine, valid_moves, table_id)
                async with async_session() as db:
                    state_snapshot = engine.get_state_snapshot()
                    try:
                        await game_manager.make_move(
                            db, table_id, BOT_PLAYER_ID,
                            move.from_point, move.to_point,
                        )
                    except (ValueError, IndexError, KeyError) as e:
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
                            match_over = table.status == "finished"
                            game_over_data = {
                                "winner_id": table.winner_id,
                                "win_type": table.win_type,
                                "final_score": table.final_score,
                                "match_over": match_over,
                                "white_match_score": table.white_match_score,
                                "black_match_score": table.black_match_score,
                            }
                            for pid in manager.get_player_ids(table_id):
                                await manager.send_to_player(
                                    table_id, pid,
                                    {"type": "game_over", "data": game_over_data},
                                )
                        # Only clean up when match is truly over
                        if table and table.status == "finished":
                            game_manager.cleanup_finished_game(table_id)
                        return

    except Exception:  # Broad catch intentional: top-level asyncio task must not propagate
        logger.exception("Error during bot turn for table %s", table_id)


def schedule_bot_turn_if_needed(table_id: str) -> None:
    """Schedule a bot turn as an asyncio task if it's the bot's turn."""
    if is_bot_game(table_id) and is_bot_turn(table_id):
        asyncio.create_task(execute_bot_turn(table_id))


def evaluate_hint_moves(table_id: str, engine) -> list[dict] | None:
    """Evaluate all valid moves and return the top 3 ranked by equity.

    Returns a list of dicts with 'from', 'to', and 'equity' keys,
    or None if the ML model is unavailable.
    """
    difficulty = get_bot_difficulty(table_id)

    # Try V2 bot first if expert difficulty
    bot = None
    if difficulty == "expert":
        bot = _load_v2_bot()
    if bot is None:
        bot = _load_ml_bot()
    if bot is None:
        return None

    valid_moves = engine.get_valid_moves()
    if not valid_moves:
        return []

    current_color = engine.state.current_turn
    scored_moves = []

    for move in valid_moves:
        snapshot = engine._snapshot_internals()
        engine._apply_move_internal(current_color, move)

        try:
            if hasattr(bot, '_evaluate_position'):
                equity = bot._evaluate_position(engine, current_color)
            else:
                import torch
                from encoder import encode_state
                from model import compute_equity
                with torch.no_grad():
                    features = encode_state(engine, current_color)
                    features_tensor = torch.from_numpy(features).to(bot.device)
                    outputs = bot.model(features_tensor)
                    equity = compute_equity(outputs).item()
        except Exception:
            engine._restore_internals(snapshot)
            continue

        engine._restore_internals(snapshot)
        scored_moves.append({
            "from": move.from_point,
            "to": move.to_point,
            "equity": round(equity, 4),
        })

    # Sort by equity descending (best moves first) and return top 3
    scored_moves.sort(key=lambda m: m["equity"], reverse=True)
    return scored_moves[:3]


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
