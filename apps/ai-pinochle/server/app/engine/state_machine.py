"""Phase-transition dispatcher for the Pinochle state machine.

This is the single entry point the WebSocket adapter calls. Given an action
name, it looks up the pure reducer and invokes it. Reducers are responsible
for their own phase guards — the dispatcher just routes.

Contract:
    apply_action(state, action, payload, actor_seat, metadata)
        -> (new_state, events, side_effects)

- `state` is a deep copy the dispatcher may mutate freely.
- `events` are adapter-ready dispatch specs (see `actions/__init__.py`).
- `side_effects` describe analytics persistence hooks for the adapter.
- `GameRuleError` is raised for rule violations.

Adding a new action = implement `reduce()` in `actions/<name>.py` and add it
to `_ACTIONS` below. No other file needs to change.
"""
from app.engine.actions import (
    acknowledge_hand_result,
    acknowledge_meld,
    declare_trump,
    pass_cards,
    play_card,
    rematch,
    start_game,
    submit_bid,
)
from app.engine.errors import ErrorCode, GameRuleError

_ACTIONS = {
    "START_GAME": start_game.reduce,
    "SUBMIT_BID": submit_bid.reduce,
    "DECLARE_TRUMP": declare_trump.reduce,
    "PASS_CARDS": pass_cards.reduce,
    "ACKNOWLEDGE_MELD": acknowledge_meld.reduce,
    "PLAY_CARD": play_card.reduce,
    "ACKNOWLEDGE_HAND_RESULT": acknowledge_hand_result.reduce,
    "REMATCH_REQUEST": rematch.reduce,
}


def apply_action(
    state: dict,
    action: str,
    payload: dict,
    actor_seat: str | None,
    metadata: dict | None = None,
) -> tuple[dict, list[dict], list[dict]]:
    """Dispatch an action to its reducer and return the result."""
    reducer = _ACTIONS.get(action)
    if reducer is None:
        raise GameRuleError(ErrorCode.UNKNOWN_ACTION, f"Unknown action: {action}")
    return reducer(state, payload or {}, actor_seat, metadata or {})


def supports(action: str) -> bool:
    """Return True if the reducer handles this action (vs adapter-only actions)."""
    return action in _ACTIONS
