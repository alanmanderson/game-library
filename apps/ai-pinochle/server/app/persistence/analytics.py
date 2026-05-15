"""Inline analytics writes for hands/bids/tricks tables.

These writes are best-effort — failures are logged and swallowed so a DB
hiccup in analytics never breaks the live game flow.
"""
import logging
import uuid
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

_SEAT_TO_COLUMN = {
    "NORTH": "north_card",
    "EAST": "east_card",
    "SOUTH": "south_card",
    "WEST": "west_card",
}


async def insert_hand(
    db: AsyncSession,
    *,
    game_id: uuid.UUID,
    hand_number: int,
    winning_bidder_id: uuid.UUID | None,
    winning_bid: int | None,
    is_shoot_the_moon: bool,
    trump_suit: str | None,
    team_meld: dict[str, int],
    trick_scores: dict[str, int],
    score_deltas: dict[str, int],
    bidding_team: str | None,
) -> uuid.UUID | None:
    """Insert a row into hands. Returns the new id, or None on failure."""
    hand_id = uuid.uuid4()
    is_set = None
    if bidding_team and winning_bid is not None:
        team_total = team_meld.get(bidding_team, 0) + trick_scores.get(bidding_team, 0)
        is_set = team_total < winning_bid
    try:
        await db.execute(
            text(
                "INSERT INTO hands (id, game_id, hand_number, winning_bidder_id, "
                "winning_bid_amount, is_shoot_the_moon, trump_suit, ns_meld_score, "
                "ew_meld_score, ns_trick_score, ew_trick_score, is_set) "
                "VALUES (:id, :game_id, :hand_number, :winning_bidder_id, "
                ":winning_bid, :is_shoot_the_moon, :trump_suit, :ns_meld, :ew_meld, "
                ":ns_trick, :ew_trick, :is_set)"
            ),
            {
                "id": str(hand_id),
                "game_id": str(game_id),
                "hand_number": hand_number,
                "winning_bidder_id": str(winning_bidder_id) if winning_bidder_id else None,
                "winning_bid": winning_bid,
                "is_shoot_the_moon": is_shoot_the_moon,
                "trump_suit": trump_suit,
                "ns_meld": team_meld.get("NS"),
                "ew_meld": team_meld.get("EW"),
                "ns_trick": trick_scores.get("NS"),
                "ew_trick": trick_scores.get("EW"),
                "is_set": is_set,
            },
        )
        return hand_id
    except Exception:
        logger.exception("Failed to insert hand row for game %s", game_id)
        return None


async def insert_bids(
    db: AsyncSession,
    *,
    hand_id: uuid.UUID,
    bids: Iterable[dict],
) -> None:
    """Insert one row per bid in the auction.

    Each `bids` entry is a dict {player_id, bid_amount, is_shoot_the_moon, sequence}.
    """
    try:
        for entry in bids:
            await db.execute(
                text(
                    "INSERT INTO bids (id, hand_id, player_id, bid_amount, "
                    "is_shoot_the_moon, bid_sequence) VALUES "
                    "(:id, :hand_id, :player_id, :bid_amount, :is_stm, :seq)"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "hand_id": str(hand_id),
                    "player_id": str(entry["player_id"]),
                    "bid_amount": entry["bid_amount"],
                    "is_stm": entry.get("is_shoot_the_moon", False),
                    "seq": entry["sequence"],
                },
            )
    except Exception:
        logger.exception("Failed to insert bids for hand %s", hand_id)


async def insert_trick(
    db: AsyncSession,
    *,
    hand_id: uuid.UUID,
    trick_number: int,
    led_by_player_id: uuid.UUID | None,
    won_by_player_id: uuid.UUID | None,
    cards_played: list[dict],
    trick_points: int,
) -> None:
    """Insert a row into tricks.

    `cards_played` is a list of {seat, card} dicts (length 4 once a trick is complete).
    """
    try:
        seat_cards = {entry["seat"]: entry["card"] for entry in cards_played}
        await db.execute(
            text(
                "INSERT INTO tricks (id, hand_id, trick_number, led_by_player_id, "
                "won_by_player_id, north_card, east_card, south_card, west_card, "
                "trick_points) VALUES "
                "(:id, :hand_id, :trick_number, :led_by, :won_by, "
                ":north, :east, :south, :west, :points)"
            ),
            {
                "id": str(uuid.uuid4()),
                "hand_id": str(hand_id),
                "trick_number": trick_number,
                "led_by": str(led_by_player_id) if led_by_player_id else None,
                "won_by": str(won_by_player_id) if won_by_player_id else None,
                "north": seat_cards.get("NORTH"),
                "east": seat_cards.get("EAST"),
                "south": seat_cards.get("SOUTH"),
                "west": seat_cards.get("WEST"),
                "points": trick_points,
            },
        )
    except Exception:
        logger.exception("Failed to insert trick for hand %s", hand_id)
