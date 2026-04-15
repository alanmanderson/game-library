"""Translate reducer side-effect descriptors into analytics DB writes.

Keeps handlers.py focused on WS I/O. All functions here are best-effort:
an analytics failure never breaks the live game (the underlying
`insert_hand`/`insert_trick` helpers already swallow exceptions).
"""
import logging
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.game import Game
from app.persistence.analytics import insert_bids, insert_hand, insert_trick
from app.websocket.state_io import OptimisticLockError, save_game_state

logger = logging.getLogger(__name__)

SEAT_COLUMNS = {
    "NORTH": "north_player_id",
    "EAST": "east_player_id",
    "SOUTH": "south_player_id",
    "WEST": "west_player_id",
}


async def dispatch(
    db: AsyncSession, game: Game, state: dict, side_effects: list[dict]
) -> None:
    """Persist hands/bids/tricks rows for each relevant side effect."""
    hand = state.get("current_hand") or {}

    for sfx in side_effects:
        kind = sfx.get("type")
        if kind == "hand_created":
            await _persist_new_hand(db, game, state, hand, sfx)
        elif kind == "trick_finished":
            await _persist_finished_trick(db, game, hand, sfx)
        elif kind == "hand_completed":
            await _persist_hand_completion(db, hand, sfx)
        # "save_extra", "game_started", "game_over" are consumed elsewhere.


async def _persist_new_hand(
    db: AsyncSession, game: Game, state: dict, hand: dict, sfx: dict
) -> None:
    winning_seat = sfx["winning_seat"]
    hand_id = await insert_hand(
        db,
        game_id=game.id,
        hand_number=sfx["hand_number"],
        winning_bidder_id=getattr(game, SEAT_COLUMNS[winning_seat]),
        winning_bid=sfx["winning_bid"],
        is_shoot_the_moon=sfx["is_shoot_the_moon"],
        trump_suit=sfx["trump_suit"],
        team_meld={},
        trick_scores={},
        score_deltas={},
        bidding_team=sfx["bidding_team"],
    )
    if hand_id is None:
        return

    seat_to_user_id = {s: getattr(game, c) for s, c in SEAT_COLUMNS.items()}
    bid_rows = []
    for i, entry in enumerate(sfx.get("auction", [])):
        uid = seat_to_user_id.get(entry["seat"])
        if uid is None:
            continue
        bid_rows.append({
            "player_id": uid,
            "bid_amount": entry["bid_amount"],
            "is_shoot_the_moon": False,
            "sequence": i + 1,
        })
    await insert_bids(db, hand_id=hand_id, bids=bid_rows)

    # Best-effort: patch analytics_hand_id back into state for later trick writes.
    hand["analytics_hand_id"] = str(hand_id)
    try:
        await save_game_state(db, game, state)
    except OptimisticLockError:
        logger.debug("could not persist analytics_hand_id (state moved)")


async def _persist_finished_trick(
    db: AsyncSession, game: Game, hand: dict, sfx: dict
) -> None:
    hand_id_str = hand.get("analytics_hand_id")
    if not hand_id_str:
        return
    try:
        hand_id = uuid.UUID(hand_id_str)
    except ValueError:
        return

    finished_trick = sfx["finished_trick"]
    led_seat = finished_trick[0]["seat"] if finished_trick else None
    seat_to_user_id = {s: getattr(game, c) for s, c in SEAT_COLUMNS.items()}
    await insert_trick(
        db,
        hand_id=hand_id,
        trick_number=sfx["trick_number"],
        led_by_player_id=seat_to_user_id.get(led_seat) if led_seat else None,
        won_by_player_id=seat_to_user_id.get(sfx["winner_seat"]),
        cards_played=finished_trick,
        trick_points=sfx["points"],
    )


async def _persist_hand_completion(
    db: AsyncSession, hand: dict, sfx: dict
) -> None:
    hand_id_str = hand.get("analytics_hand_id")
    if not hand_id_str:
        return
    try:
        bidding_team = sfx["bidding_team"]
        await db.execute(
            text(
                "UPDATE hands SET ns_meld_score=:ns_meld, ew_meld_score=:ew_meld, "
                "ns_trick_score=:ns_trick, ew_trick_score=:ew_trick, is_set=:is_set "
                "WHERE id=:id"
            ),
            {
                "id": hand_id_str,
                "ns_meld": sfx["team_meld"].get("NS"),
                "ew_meld": sfx["team_meld"].get("EW"),
                "ns_trick": sfx["trick_scores"].get("NS"),
                "ew_trick": sfx["trick_scores"].get("EW"),
                "is_set": (sfx["score_deltas"].get(bidding_team, 0) < 0),
            },
        )
    except Exception:
        logger.exception("Failed to update hand completion stats")
