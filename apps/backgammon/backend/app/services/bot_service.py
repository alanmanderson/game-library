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
from app.game_engine import Color, DiceRoll, GameStatus, _home_range, _off_point, _opponent

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


def _is_no_contact_bearoff(engine) -> bool:
    """Check if the current player is in a no-contact bearing off position.

    Returns True when the current player can bear off AND the opponent has
    no checkers in the current player's home board (and none on the bar
    that could re-enter into it).  In this situation the game is a pure
    race and a simple heuristic beats the neural network.
    """
    color = engine.state.current_turn
    if not engine._check_can_bear_off(color):
        return False

    opp = _opponent(color)
    # Opponent on the bar could re-enter into our home board
    if opp == Color.WHITE and engine.state.bar_white > 0:
        return False
    if opp == Color.BLACK and engine.state.bar_black > 0:
        return False

    # Any opponent checker sitting in our home board means contact
    home = _home_range(color)
    for pt in home:
        val = engine.state.points[pt]
        if color == Color.WHITE and val < 0:
            return False
        if color == Color.BLACK and val > 0:
            return False

    return True


def _score_bearoff_move(move, color) -> float:
    """Score a move for optimal no-contact bearing off play.

    Always prefer bearing off over moving within the home board.
    When bearing off, prefer the checker farthest from the off point
    (most efficient use of the die).  When moving, prefer moving the
    farthest checker closer to the off point.
    """
    off = _off_point(color)
    is_bearoff = move.to_point == off

    # Distance from the off point (higher = farther away)
    if color == Color.WHITE:
        distance = move.from_point        # off point is 0
    else:
        distance = 25 - move.from_point   # off point is 25

    if is_bearoff:
        return 1000.0 + distance
    else:
        return float(distance)


def _evaluate_position_heuristic(engine, color) -> float:
    """Evaluate a board position using simple heuristics.

    Used by medium difficulty for full-turn evaluation.  Returns a
    score where higher is better for *color*.
    """
    state = engine.state
    is_white = color.value == "white"
    inc = 1 if is_white else -1
    score = 0.0

    # Pip count advantage
    own_pips = opp_pips = 0
    for i in range(1, 25):
        val = state.points[i]
        if is_white:
            if val > 0:
                own_pips += val * i
            elif val < 0:
                opp_pips += (-val) * (25 - i)
        else:
            if val < 0:
                own_pips += (-val) * (25 - i)
            elif val > 0:
                opp_pips += val * i
    own_pips += (state.bar_white if is_white else state.bar_black) * 25
    opp_pips += (state.bar_black if is_white else state.bar_white) * 25
    score += (opp_pips - own_pips) * 0.003

    # Home board points made (very valuable)
    home = range(1, 7) if is_white else range(19, 25)
    for pt in home:
        if state.points[pt] * inc >= 2:
            score += 0.4

    # Blots penalty (exposed checkers)
    for i in range(1, 25):
        if state.points[i] * inc == 1:
            score -= 0.2

    # Borne off checkers
    off = state.off_white if is_white else state.off_black
    score += off * 0.3

    # Opponent on bar (good for us)
    opp_bar = state.bar_black if is_white else state.bar_white
    score += opp_bar * 0.3

    # Own checkers on bar (bad for us)
    own_bar = state.bar_white if is_white else state.bar_black
    score -= own_bar * 0.5

    return score


# All 21 distinct dice outcomes: (die1, die2, die_values, probability)
_DICE_OUTCOMES: list[tuple[int, int, list[int], float]] = []
for _d1 in range(1, 7):
    for _d2 in range(_d1, 7):
        if _d1 == _d2:
            _DICE_OUTCOMES.append((_d1, _d2, [_d1] * 4, 1.0 / 36.0))
        else:
            _DICE_OUTCOMES.append((_d1, _d2, [_d1, _d2], 2.0 / 36.0))


def _evaluate_1ply(engine, color, scored_turns, eval_fn, top_n=5):
    """Re-rank top candidate turns using 1-ply lookahead.

    For each of the top *top_n* candidates (sorted best-first by 0-ply
    equity), simulate all 21 possible opponent dice rolls.  For each
    roll, find the opponent's best response (the move that minimises
    *our* equity) and weight by roll probability.  Return the candidate
    with the highest expected 1-ply equity.

    This is roughly: top_n × 21 rolls × ~25 opponent turns ≈ 2,500–3,000
    neural-net evaluations — well under a second for a small network.
    """
    if len(scored_turns) <= 1:
        return scored_turns[0][1] if scored_turns else None

    opp_color = _opponent(color)
    top_candidates = scored_turns[:top_n]
    is_white = color == Color.WHITE

    best_turn = top_candidates[0][1]
    best_1ply_eq = float('-inf')

    for _zero_ply_eq, turn in top_candidates:
        # Apply our candidate turn
        saved_outer = engine._snapshot_internals()
        for m in turn:
            engine._apply_move_internal(color, m)

        # If all our checkers are off the board, we've won — no opponent turn
        our_off = engine.state.off_white if is_white else engine.state.off_black
        if our_off >= 15:
            eq = eval_fn(engine, color)
            engine._restore_internals(saved_outer)
            if eq > best_1ply_eq:
                best_1ply_eq = eq
                best_turn = turn
            continue

        # Save engine state fields that we temporarily overwrite
        orig_current_turn = engine.state.current_turn
        orig_dice = engine.state.dice
        orig_remaining = (list(engine.state.remaining_dice)
                          if engine.state.remaining_dice else [])
        orig_status = engine.state.status

        weighted_eq = 0.0

        for d1, d2, dice_values, prob in _DICE_OUTCOMES:
            # Set up opponent's hypothetical turn
            engine.state.current_turn = opp_color
            engine.state.dice = DiceRoll(d1, d2)
            engine.state.remaining_dice = list(dice_values)
            engine.state.status = GameStatus.MOVING

            opp_turns = engine.enumerate_complete_turns()

            if not opp_turns:
                # Opponent can't move — evaluate position as-is
                roll_eq = eval_fn(engine, color)
            else:
                # Opponent picks the turn that minimises our equity
                min_eq = float('inf')
                for opp_turn in opp_turns:
                    saved_inner = engine._snapshot_internals()
                    for om in opp_turn:
                        engine._apply_move_internal(opp_color, om)
                    eq = eval_fn(engine, color)
                    engine._restore_internals(saved_inner)
                    if eq < min_eq:
                        min_eq = eq
                roll_eq = min_eq

            weighted_eq += prob * roll_eq

        # Restore everything
        engine.state.current_turn = orig_current_turn
        engine.state.dice = orig_dice
        engine.state.remaining_dice = orig_remaining
        engine.state.status = orig_status
        engine._restore_internals(saved_outer)

        if weighted_eq > best_1ply_eq:
            best_1ply_eq = weighted_eq
            best_turn = turn

    return best_turn


def _select_bot_move(engine, valid_moves, table_id: str = ""):
    """Select a single move based on the table's difficulty setting.

    This is the per-move fallback used when full-turn planning is
    unavailable (easy difficulty) or when a planned move is invalid.
    """
    difficulty = get_bot_difficulty(table_id)

    if difficulty == "easy":
        return random.choice(valid_moves)

    # In a no-contact bearoff, use a deterministic heuristic instead of the
    # ML model.  A simple "always bear off, move farthest checker" rule is
    # near-optimal.
    if _is_no_contact_bearoff(engine):
        color = engine.state.current_turn
        return max(valid_moves, key=lambda m: _score_bearoff_move(m, color))

    if difficulty == "medium":
        return max(valid_moves, key=lambda m: _heuristic_score_move(engine, m))

    # Default: random (ML full-turn eval is the normal path now)
    return random.choice(valid_moves)


def _plan_bot_turn(engine, table_id: str):
    """Plan the bot's complete turn using full-turn evaluation.

    Enumerates all possible complete move sequences for the current dice
    roll and picks the best one.  For expert difficulty, uses the opening
    book, game-phase routing (race evaluator vs neural net), and the V2
    model.

    Returns a list of Move objects to execute in order, an empty list if
    no moves are possible, or None to fall back to per-move selection.
    """
    difficulty = get_bot_difficulty(table_id)
    color = engine.state.current_turn

    if difficulty == "easy":
        return None  # easy uses random per-move

    # --- Expert: opening book ---
    if difficulty == "expert":
        try:
            ml_dir = _find_ml_dir()
            if ml_dir and ml_dir not in sys.path:
                sys.path.insert(0, ml_dir)
            from opening_book import get_opening_moves, is_opening_position
            if is_opening_position(engine) and engine.state.dice:
                dice = (engine.state.dice.die1, engine.state.dice.die2)
                book_moves = get_opening_moves(dice, color)
                if book_moves is not None:
                    logger.info("Expert bot using opening book for %s", dice)
                    return book_moves
        except ImportError:
            pass

    # --- Enumerate all possible complete turns ---
    turns = engine.enumerate_complete_turns()
    if not turns:
        return []
    if len(turns) == 1:
        return turns[0]

    # --- Expert: game-phase routing ---
    if difficulty == "expert":
        try:
            ml_dir = _find_ml_dir()
            if ml_dir and ml_dir not in sys.path:
                sys.path.insert(0, ml_dir)
            from game_phases import (classify_game_phase,
                                     evaluate_race_position, GamePhase)
            phase = classify_game_phase(engine)

            # Race / bearoff: pip-count evaluator is much better than NN
            if phase in (GamePhase.RACE, GamePhase.BEAROFF):
                best_turn, best_eq = None, float('-inf')
                for turn in turns:
                    saved = engine._snapshot_internals()
                    for m in turn:
                        engine._apply_move_internal(color, m)
                    eq = evaluate_race_position(engine, color)
                    engine._restore_internals(saved)
                    if eq > best_eq:
                        best_eq = eq
                        best_turn = turn
                return best_turn
        except ImportError:
            pass

    # --- Expert: V2 neural net for contact positions (with 1-ply lookahead) ---
    if difficulty == "expert":
        v2_bot = _load_v2_bot()
        if v2_bot is not None:
            try:
                scored_turns = []
                for turn in turns:
                    saved = engine._snapshot_internals()
                    for m in turn:
                        engine._apply_move_internal(color, m)
                    eq = v2_bot._evaluate_position(engine, color)
                    engine._restore_internals(saved)
                    scored_turns.append((eq, turn))
                scored_turns.sort(key=lambda x: x[0], reverse=True)
                return _evaluate_1ply(engine, color, scored_turns,
                                      v2_bot._evaluate_position)
            except (ValueError, IndexError, KeyError) as e:
                logger.warning("V2 full-turn eval failed: %s", e)

    # --- Hard (or expert fallback): V1 neural net (with 1-ply lookahead) ---
    if difficulty in ("hard", "expert"):
        ml_bot = _load_ml_bot()
        if ml_bot is not None:
            try:
                import torch
                ml_dir = _find_ml_dir()
                if ml_dir and ml_dir not in sys.path:
                    sys.path.insert(0, ml_dir)
                from encoder import encode_state
                from model import compute_equity

                def _eval_v1(eng, clr):
                    with torch.no_grad():
                        features = encode_state(eng, clr)
                        ft = torch.from_numpy(features).to(ml_bot.device)
                        outputs = ml_bot.model(ft)
                        return compute_equity(outputs).item()

                scored_turns = []
                for turn in turns:
                    saved = engine._snapshot_internals()
                    for m in turn:
                        engine._apply_move_internal(color, m)
                    eq = _eval_v1(engine, color)
                    engine._restore_internals(saved)
                    scored_turns.append((eq, turn))
                scored_turns.sort(key=lambda x: x[0], reverse=True)
                return _evaluate_1ply(engine, color, scored_turns, _eval_v1)
            except (ValueError, IndexError, KeyError, ImportError) as e:
                logger.warning("ML full-turn eval failed: %s", e)

    # --- Medium: heuristic position evaluation ---
    if difficulty == "medium":
        best_turn, best_score = None, float('-inf')
        for turn in turns:
            saved = engine._snapshot_internals()
            for m in turn:
                engine._apply_move_internal(color, m)
            s = _evaluate_position_heuristic(engine, color)
            engine._restore_internals(saved)
            if s > best_score:
                best_score = s
                best_turn = turn
        return best_turn

    return None  # fall back to per-move selection


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

        # --- Plan full turn ---
        planned_turn = None
        async with game_manager._get_lock(table_id):
            engine = game_manager.get_engine(table_id)
            if engine and engine.state.status == GameStatus.MOVING:
                try:
                    planned_turn = _plan_bot_turn(engine, table_id)
                except Exception as e:
                    logger.warning("Bot turn planning failed: %s", e)

        # --- Make moves ---
        move_index = 0
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

                # Use planned move if available, else fall back
                move = None
                if planned_turn is not None and move_index < len(planned_turn):
                    planned_move = planned_turn[move_index]
                    if planned_move in valid_moves:
                        move = planned_move
                    else:
                        logger.warning(
                            "Planned move %s->%s not in valid moves, "
                            "falling back to per-move selection",
                            planned_move.from_point, planned_move.to_point,
                        )
                        planned_turn = None  # abandon plan
                if move is None:
                    move = _select_bot_move(engine, valid_moves, table_id)
                move_index += 1

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
