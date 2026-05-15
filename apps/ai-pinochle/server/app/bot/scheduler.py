"""Bot turn scheduler.

After any state mutation (human or bot), ``maybe_schedule_bot_turn`` checks
if the next actor is a bot and schedules their action with a short delay.

The scheduler opens its own DB session, loads fresh game state, applies the
bot's action through the same ``apply_action()`` that human moves use, and
persists the result with optimistic locking. On version conflicts the turn
is silently dropped -- the next human or bot action will re-trigger the check.
"""
import asyncio
import copy
import logging
import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.bot import strategy
from app.bot.users import BOT_UUIDS, is_bot_user
from app.engine.constants import next_seat
from app.engine.deck import SEATS, shuffle_and_deal
from app.engine.errors import GameRuleError
from app.engine.state_machine import apply_action
from app.models.game import Game
from app.websocket import analytics_sink, event_bus
from app.websocket.connection_manager import manager
from app.websocket.state_io import OptimisticLockError, save_game_state

logger = logging.getLogger(__name__)

BOT_DELAY_SECONDS = 0.5

SEAT_COLUMNS = {
    "NORTH": "north_player_id",
    "EAST": "east_player_id",
    "SOUTH": "south_player_id",
    "WEST": "west_player_id",
}

# Module-level session factory, set by main.py at lifespan start.
_session_factory: async_sessionmaker | None = None


def set_session_factory(factory: async_sessionmaker) -> None:
    global _session_factory
    _session_factory = factory


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def maybe_schedule_bot_turn(game: Game, state: dict, room_code: str) -> None:
    """Check if the next actor is a bot and schedule their turn after a delay."""
    bot_seats = state.get("bot_seats", [])
    if not bot_seats:
        return

    phase = state.get("phase")
    if phase in ("LOBBY_WAITING", "GAME_OVER", None):
        return

    seats_to_act = _get_bot_seats_needing_action(state, bot_seats, phase)
    if not seats_to_act:
        return

    # Schedule the first needed bot's turn with a short delay.
    bot_seat = seats_to_act[0]
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.warning("No running event loop for bot scheduling")
        return

    loop.call_later(
        BOT_DELAY_SECONDS,
        lambda: asyncio.ensure_future(_execute_bot_turn(room_code, bot_seat)),
    )


# ---------------------------------------------------------------------------
# Phase inspection
# ---------------------------------------------------------------------------


def _get_bot_seats_needing_action(
    state: dict, bot_seats: list[str], phase: str
) -> list[str]:
    """Return bot seats that need to take action in the current phase."""
    hand = state.get("current_hand", {})

    if phase == "BIDDING":
        next_to_act = hand.get("bidding", {}).get("next_to_act_seat")
        if next_to_act in bot_seats:
            return [next_to_act]

    elif phase == "NAMING_TRUMP":
        winner = hand.get("bidding", {}).get("winning_seat")
        if winner in bot_seats:
            return [winner]

    elif phase == "PASSING_CARDS":
        passing = hand.get("card_passing", {})
        submitted = set(passing.get("submitted", {}).keys())
        bidder = passing.get("bidder_seat")
        partner = passing.get("partner_seat")
        needs = []
        for seat in [bidder, partner]:
            if seat in bot_seats and seat not in submitted:
                needs.append(seat)
        return needs

    elif phase == "SHOWING_MELD":
        acked = set(hand.get("meld_acknowledged_seats", []))
        for seat in bot_seats:
            if seat not in acked:
                return [seat]

    elif phase == "TRICK_PLAYING":
        next_to_act = hand.get("trick_play", {}).get("next_to_act_seat")
        if next_to_act in bot_seats:
            return [next_to_act]

    elif phase == "HAND_COMPLETE":
        acked = set(hand.get("hand_result_acknowledged_seats", []))
        for seat in bot_seats:
            if seat not in acked:
                return [seat]

    return []


# ---------------------------------------------------------------------------
# Bot turn execution
# ---------------------------------------------------------------------------


async def _execute_bot_turn(room_code: str, bot_seat: str) -> None:
    """Execute a single bot turn in its own DB session."""
    if _session_factory is None:
        logger.error("Bot session factory not initialized")
        return

    try:
        async with _session_factory() as db:
            async with db.begin():
                async with manager.get_room_lock(room_code):
                    game = await _load_game(db, room_code)
                    if game is None:
                        return

                    state = game.current_state_json or {}
                    bot_seats = state.get("bot_seats", [])
                    if bot_seat not in bot_seats:
                        return

                    bot_user_id = BOT_UUIDS.get(bot_seat)
                    if not bot_user_id:
                        return

                    decision = _make_decision(state, bot_seat)
                    if decision is None:
                        return

                    action = decision["action"]
                    payload = decision["payload"]

                    old_state = copy.deepcopy(state)
                    metadata = _build_bot_metadata(game, action, bot_user_id)

                    try:
                        new_state, events, side_effects = apply_action(
                            old_state, action, payload, bot_seat, metadata
                        )
                    except GameRuleError as e:
                        logger.warning(
                            "Bot %s action %s failed: %s", bot_seat, action, e
                        )
                        return

                    # Preserve bot_seats and hints_enabled across state-rebuilding reducers.
                    if bot_seats and "bot_seats" not in new_state:
                        new_state["bot_seats"] = bot_seats

                    if state.get("hints_enabled") and "hints_enabled" not in new_state:
                        new_state["hints_enabled"] = True

                    save_extra = _collect_save_extra(action, side_effects)

                    try:
                        await save_game_state(
                            db, game, new_state, extra=save_extra or None
                        )
                    except OptimisticLockError:
                        logger.info(
                            "Bot %s: optimistic lock conflict, will retry",
                            bot_seat,
                        )
                        return

                    achievement_events = await analytics_sink.dispatch(db, game, new_state, side_effects)
                    await event_bus.dispatch(game, room_code, new_state, events + achievement_events)

                    # Post-dispatch bookkeeping (mirrors _apply in handlers.py)
                    if new_state.get("phase") == "GAME_OVER":
                        manager.disconnect_times.pop(room_code, None)

                    # Chain: check if the next actor is also a bot.
                    maybe_schedule_bot_turn(game, new_state, room_code)
    except Exception:
        logger.exception(
            "Bot turn failed for %s in room %s", bot_seat, room_code
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _load_game(db: AsyncSession, room_code: str) -> Game | None:
    """Load the IN_PROGRESS game, bypassing the identity map cache."""
    result = await db.execute(
        select(Game)
        .where(Game.room_code == room_code, Game.status == "IN_PROGRESS")
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


def _make_decision(state: dict, seat: str) -> dict | None:
    """Choose the bot's action based on current phase."""
    phase = state.get("phase")
    hand_cards = state.get("player_hands", {}).get(seat, [])
    current_hand = state.get("current_hand", {})

    if phase == "BIDDING":
        bidding = current_hand.get("bidding", {})
        return strategy.choose_bid(hand_cards, bidding)

    elif phase == "NAMING_TRUMP":
        return strategy.choose_trump(hand_cards)

    elif phase == "PASSING_CARDS":
        trump = current_hand.get("trump_suit", "HEARTS")
        return strategy.choose_pass_cards(hand_cards, trump)

    elif phase == "SHOWING_MELD":
        return strategy.choose_acknowledge()

    elif phase == "TRICK_PLAYING":
        return strategy.choose_card(hand_cards, state, seat)

    elif phase == "HAND_COMPLETE":
        return strategy.choose_acknowledge_hand_result()

    return None


def _build_bot_metadata(
    game: Game, action: str, bot_user_id: uuid.UUID
) -> dict:
    """Build metadata dict matching the contract of handlers._build_metadata."""
    meta: dict = {"room_code": game.room_code, "actor_user_id": bot_user_id}

    if action == "START_GAME":
        meta["all_seats_filled"] = all(
            getattr(game, col) is not None for col in SEAT_COLUMNS.values()
        )
        meta["new_deal"] = shuffle_and_deal()
        dealer_seat = random.choice(SEATS)
        meta["new_dealer"] = dealer_seat
        meta["first_bidder"] = SEATS[(SEATS.index(dealer_seat) + 1) % 4]

    elif action == "ACKNOWLEDGE_HAND_RESULT":
        meta["new_deal"] = shuffle_and_deal()

    return meta


def _collect_save_extra(action: str, side_effects: list[dict]) -> dict:
    """Flatten ``save_extra`` side effects into the UPDATE-time column map."""
    extra: dict = {}
    now = datetime.now(timezone.utc)
    for sfx in side_effects:
        if sfx.get("type") == "save_extra":
            extra.update(sfx["extra"])
            if sfx.get("set_ended_at"):
                extra["ended_at"] = now
            if sfx.get("set_started_at"):
                extra["started_at"] = now
    if action == "START_GAME":
        extra.setdefault("started_at", now)
    return extra
