"""Tests for AI bot functionality.

Covers:
- Bot user creation (idempotent get_or_create_bots)
- Strategy functions (choose_bid, choose_trump, choose_pass_cards, choose_card)
- choose_card always returns a legal card
- _get_bot_seats_needing_action identifies bot turns per phase
- FILL_AI action fills empty seats
- Integration: create-vs-ai endpoint
- Full bot game simulation through the pure state machine
"""
import copy
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.scheduler import _get_bot_seats_needing_action, _make_decision
from app.bot.strategy import (
    choose_acknowledge,
    choose_acknowledge_hand_result,
    choose_bid,
    choose_card,
    choose_pass_cards,
    choose_trump,
)
from app.bot.users import ALL_BOT_IDS, BOT_NAMES, BOT_UUIDS, get_or_create_bots, is_bot_user
from app.engine.constants import TEAM_FOR_SEAT, new_hand_state, next_seat
from app.engine.deck import SEATS, shuffle_and_deal
from app.engine.meld import SUIT_LETTER
from app.engine.state_machine import apply_action
from app.engine.tricks import card_suit, get_legal_cards
from app.models.game import Game
from app.models.user import User


# ---------------------------------------------------------------------------
# Bot user creation
# ---------------------------------------------------------------------------


class TestBotUsers:
    async def test_get_or_create_bots_creates_users(self, db_session: AsyncSession):
        result = await get_or_create_bots(db_session)
        assert set(result.keys()) == {"NORTH", "EAST", "SOUTH", "WEST"}
        for seat, bot_id in result.items():
            row = await db_session.execute(select(User).where(User.id == bot_id))
            user = row.scalar_one()
            assert user.first_name == BOT_NAMES[seat]
            assert user.username == f"bot_{seat.lower()}"

    async def test_get_or_create_bots_idempotent(self, db_session: AsyncSession):
        """Calling twice should not raise or duplicate."""
        await get_or_create_bots(db_session)
        await get_or_create_bots(db_session)
        for bot_id in BOT_UUIDS.values():
            row = await db_session.execute(select(User).where(User.id == bot_id))
            assert row.scalar_one() is not None

    def test_is_bot_user(self):
        for bot_id in ALL_BOT_IDS:
            assert is_bot_user(bot_id) is True
        assert is_bot_user(uuid.uuid4()) is False


# ---------------------------------------------------------------------------
# Strategy functions
# ---------------------------------------------------------------------------


class TestStrategy:
    def test_choose_bid_pass_on_weak_hand(self):
        """A hand full of 9s should pass."""
        hand = ["9H", "9S", "9D", "9C", "9H", "9S", "9D", "9C", "9H", "9S", "9D", "9C"]
        result = choose_bid(hand, {"winning_bid": None, "minimum_valid_bid": 25})
        assert result["action"] == "SUBMIT_BID"
        assert result["payload"] == {}  # pass

    def test_choose_bid_dealer_forced_when_all_pass(self):
        """Dealer must bid minimum when all others have passed, even with a weak hand."""
        hand = ["9H", "9S", "9D", "9C", "9H", "9S", "9D", "9C", "9H", "9S", "9D", "9C"]
        result = choose_bid(hand, {
            "winning_bid": None,
            "minimum_valid_bid": 25,
            "passed_seats": ["EAST", "SOUTH", "WEST"],
        })
        assert result["action"] == "SUBMIT_BID"
        assert result["payload"]["amount"] == 25

    def test_choose_bid_bids_on_strong_hand(self):
        """A hand with many aces and high cards should bid."""
        hand = ["AH", "AH", "AS", "AS", "AD", "AD", "AC", "AC", "10H", "10S", "10D", "10C"]
        result = choose_bid(hand, {"winning_bid": None, "minimum_valid_bid": 25})
        assert result["action"] == "SUBMIT_BID"
        assert "amount" in result["payload"]
        assert result["payload"]["amount"] >= 25

    def test_choose_trump_picks_most_common_suit(self):
        hand = ["AH", "KH", "QH", "JH", "10H", "9H", "AS", "KS", "9D", "9C", "9D", "9C"]
        result = choose_trump(hand)
        assert result["action"] == "DECLARE_TRUMP"
        assert result["payload"]["suit"] == "HEARTS"

    def test_choose_pass_cards_returns_3(self):
        hand = ["AH", "KH", "QH", "9S", "9D", "9C", "JS", "JD", "JC", "10H", "10S", "10D"]
        result = choose_pass_cards(hand, "HEARTS")
        assert result["action"] == "PASS_CARDS"
        assert len(result["payload"]["cards"]) == 3
        # Should prefer non-trump cards
        for card in result["payload"]["cards"]:
            assert card in hand

    def test_choose_pass_cards_non_trump_preferred(self):
        """Passed cards should be non-trump when possible."""
        hand = ["AH", "KH", "QH", "JH", "10H", "9H", "9S", "9D", "9C", "JS", "JD", "JC"]
        result = choose_pass_cards(hand, "HEARTS")
        passed = result["payload"]["cards"]
        for card in passed:
            assert card_suit(card) != "H"

    def test_choose_card_returns_legal_card(self):
        """Verify choose_card always picks from the legal set."""
        hands = shuffle_and_deal()
        for seat in SEATS:
            state = {
                "current_hand": {
                    "trump_suit": "HEARTS",
                    "trick_play": {
                        "cards_played": [],
                        "next_to_act_seat": seat,
                    },
                },
                "player_hands": hands,
            }
            result = choose_card(hands[seat], state, seat)
            assert result["action"] == "PLAY_CARD"
            assert result["payload"]["card"] in hands[seat]

    def test_choose_card_follows_suit(self):
        """When a suit is led, bot must follow suit if able."""
        hand = ["AH", "KH", "9S", "9D"]
        state = {
            "current_hand": {
                "trump_suit": "SPADES",
                "trick_play": {
                    "cards_played": [{"seat": "NORTH", "card": "QH"}],
                    "next_to_act_seat": "EAST",
                },
            },
            "player_hands": {"EAST": hand},
        }
        result = choose_card(hand, state, "EAST")
        card = result["payload"]["card"]
        # Must follow hearts
        assert card_suit(card) == "H"

    def test_choose_acknowledge(self):
        result = choose_acknowledge()
        assert result["action"] == "ACKNOWLEDGE_MELD"

    def test_choose_acknowledge_hand_result(self):
        result = choose_acknowledge_hand_result()
        assert result["action"] == "ACKNOWLEDGE_HAND_RESULT"


# ---------------------------------------------------------------------------
# Bot seat detection
# ---------------------------------------------------------------------------


class TestBotSeatDetection:
    def test_bidding_phase(self):
        state = {
            "phase": "BIDDING",
            "current_hand": {
                "bidding": {"next_to_act_seat": "EAST"},
            },
        }
        assert _get_bot_seats_needing_action(state, ["EAST", "WEST"], "BIDDING") == ["EAST"]
        assert _get_bot_seats_needing_action(state, ["WEST"], "BIDDING") == []

    def test_naming_trump_phase(self):
        state = {
            "phase": "NAMING_TRUMP",
            "current_hand": {
                "bidding": {"winning_seat": "NORTH"},
            },
        }
        assert _get_bot_seats_needing_action(state, ["NORTH"], "NAMING_TRUMP") == ["NORTH"]
        assert _get_bot_seats_needing_action(state, ["SOUTH"], "NAMING_TRUMP") == []

    def test_passing_cards_phase(self):
        state = {
            "phase": "PASSING_CARDS",
            "current_hand": {
                "card_passing": {
                    "bidder_seat": "EAST",
                    "partner_seat": "WEST",
                    "submitted": {},
                },
            },
        }
        result = _get_bot_seats_needing_action(state, ["EAST", "WEST"], "PASSING_CARDS")
        assert "EAST" in result

    def test_passing_cards_one_already_submitted(self):
        state = {
            "phase": "PASSING_CARDS",
            "current_hand": {
                "card_passing": {
                    "bidder_seat": "EAST",
                    "partner_seat": "WEST",
                    "submitted": {"EAST": ["9H", "9S", "9D"]},
                },
            },
        }
        result = _get_bot_seats_needing_action(state, ["EAST", "WEST"], "PASSING_CARDS")
        assert result == ["WEST"]

    def test_showing_meld_phase(self):
        state = {
            "phase": "SHOWING_MELD",
            "current_hand": {
                "meld_acknowledged_seats": ["NORTH"],
            },
        }
        result = _get_bot_seats_needing_action(
            state, ["NORTH", "EAST", "WEST"], "SHOWING_MELD"
        )
        assert result == ["EAST"]

    def test_trick_playing_phase(self):
        state = {
            "phase": "TRICK_PLAYING",
            "current_hand": {
                "trick_play": {"next_to_act_seat": "WEST"},
            },
        }
        assert _get_bot_seats_needing_action(state, ["WEST"], "TRICK_PLAYING") == ["WEST"]
        assert _get_bot_seats_needing_action(state, ["EAST"], "TRICK_PLAYING") == []

    def test_hand_complete_phase(self):
        state = {
            "phase": "HAND_COMPLETE",
            "current_hand": {
                "hand_result_acknowledged_seats": ["NORTH"],
            },
        }
        result = _get_bot_seats_needing_action(
            state, ["NORTH", "EAST", "WEST"], "HAND_COMPLETE"
        )
        assert result == ["EAST"]


# ---------------------------------------------------------------------------
# FILL_AI via REST + WS
# ---------------------------------------------------------------------------


class TestFillAI:
    async def test_create_vs_ai_endpoint(self, client, auth_headers):
        resp = await client.post("/games/create-vs-ai", headers=auth_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert "room_code" in data
        room_code = data["room_code"]

        # Verify the game has bots seated
        resp2 = await client.post(
            f"/games/{room_code}/join", headers=auth_headers
        )
        assert resp2.status_code == 200
        join_data = resp2.json()
        # Human is at SOUTH, bots at N/E/W
        assert join_data["your_seat"] == "south"
        for seat in ["north", "east", "west"]:
            assert join_data["seats"][seat] is not None


# ---------------------------------------------------------------------------
# Full game simulation through the state machine
# ---------------------------------------------------------------------------


class TestFullBotGame:
    """Simulate an entire game using only apply_action and bot strategy.

    This proves the bot can navigate every game phase legally.
    """

    def _make_metadata(self, state, action, seat):
        """Minimal metadata builder for testing."""
        # Use created_by as actor so START_GAME creator check passes.
        created_by = state.get("created_by")
        actor_id = uuid.UUID(created_by) if created_by else uuid.uuid4()
        meta = {"room_code": "TEST", "actor_user_id": actor_id}
        if action == "START_GAME":
            meta["all_seats_filled"] = True
            meta["new_deal"] = shuffle_and_deal()
            import random
            dealer = random.choice(SEATS)
            meta["new_dealer"] = dealer
            meta["first_bidder"] = SEATS[(SEATS.index(dealer) + 1) % 4]
        elif action == "ACKNOWLEDGE_HAND_RESULT":
            meta["new_deal"] = shuffle_and_deal()
        return meta

    def test_bots_play_full_hand(self):
        """Simulate a full hand from BIDDING through HAND_COMPLETE with 4 bots."""
        # Start game
        lobby_state = {
            "room_code": "TEST",
            "phase": "LOBBY_WAITING",
            "created_by": str(uuid.uuid4()),
            "bot_seats": SEATS,
        }
        meta = self._make_metadata(lobby_state, "START_GAME", None)
        state, _, _ = apply_action(lobby_state, "START_GAME", {}, None, meta)
        state["bot_seats"] = SEATS  # preserve

        assert state["phase"] == "BIDDING"

        # --- BIDDING ---
        max_rounds = 20
        for _ in range(max_rounds):
            if state["phase"] != "BIDDING":
                break
            bidding = state["current_hand"]["bidding"]
            actor = bidding["next_to_act_seat"]
            hand = state["player_hands"][actor]
            decision = choose_bid(hand, bidding)
            meta = self._make_metadata(state, decision["action"], actor)
            state, _, _ = apply_action(
                state, decision["action"], decision["payload"], actor, meta
            )
        assert state["phase"] == "NAMING_TRUMP"

        # --- NAMING TRUMP ---
        winner = state["current_hand"]["bidding"]["winning_seat"]
        decision = choose_trump(state["player_hands"][winner])
        meta = self._make_metadata(state, decision["action"], winner)
        state, _, _ = apply_action(
            state, decision["action"], decision["payload"], winner, meta
        )
        assert state["phase"] == "PASSING_CARDS"

        # --- PASSING CARDS ---
        passing = state["current_hand"]["card_passing"]
        for seat in [passing["bidder_seat"], passing["partner_seat"]]:
            trump = state["current_hand"]["trump_suit"]
            decision = choose_pass_cards(state["player_hands"][seat], trump)
            meta = self._make_metadata(state, decision["action"], seat)
            state, _, _ = apply_action(
                state, decision["action"], decision["payload"], seat, meta
            )
        assert state["phase"] == "SHOWING_MELD"

        # --- SHOWING MELD ---
        for seat in SEATS:
            decision = choose_acknowledge()
            meta = self._make_metadata(state, decision["action"], seat)
            state, _, _ = apply_action(
                state, decision["action"], decision["payload"], seat, meta
            )
        assert state["phase"] == "TRICK_PLAYING"

        # --- TRICK PLAYING (12 tricks x 4 cards = 48 plays) ---
        for _ in range(48):
            if state["phase"] != "TRICK_PLAYING":
                break
            trick_play = state["current_hand"]["trick_play"]
            actor = trick_play["next_to_act_seat"]
            hand = state["player_hands"][actor]
            decision = choose_card(hand, state, actor)
            card = decision["payload"]["card"]

            # Verify the chosen card is actually legal
            cards_played = trick_play["cards_played"]
            trump_char = SUIT_LETTER[state["current_hand"]["trump_suit"]]
            led_suit = card_suit(cards_played[0]["card"]) if cards_played else None
            legal = get_legal_cards(hand, led_suit, trump_char, cards_played)
            assert card in legal, f"{actor} played {card} but legal = {legal}"

            meta = self._make_metadata(state, decision["action"], actor)
            state, _, _ = apply_action(
                state, decision["action"], decision["payload"], actor, meta
            )

        assert state["phase"] == "HAND_COMPLETE"

        # --- HAND COMPLETE ---
        for seat in SEATS:
            decision = choose_acknowledge_hand_result()
            meta = self._make_metadata(state, decision["action"], seat)
            state, _, _ = apply_action(
                state, decision["action"], decision["payload"], seat, meta
            )

        # After all 4 acks: either next hand starts (BIDDING) or game over
        assert state["phase"] in ("BIDDING", "GAME_OVER")

    def test_bots_play_until_game_over(self):
        """Simulate an entire game until GAME_OVER (may take many hands)."""
        import random
        random.seed(42)  # Deterministic deals for reproducible CI runs

        lobby_state = {
            "room_code": "TEST",
            "phase": "LOBBY_WAITING",
            "created_by": str(uuid.uuid4()),
            "bot_seats": SEATS,
        }
        meta = self._make_metadata(lobby_state, "START_GAME", None)
        state, _, _ = apply_action(lobby_state, "START_GAME", {}, None, meta)
        state["bot_seats"] = SEATS

        max_hands = 50  # Safety cap
        hands_played = 0

        while state["phase"] != "GAME_OVER" and hands_played < max_hands:
            # BIDDING
            for _ in range(20):
                if state["phase"] != "BIDDING":
                    break
                bidding = state["current_hand"]["bidding"]
                actor = bidding["next_to_act_seat"]
                decision = choose_bid(state["player_hands"][actor], bidding)
                meta = self._make_metadata(state, decision["action"], actor)
                state, _, _ = apply_action(
                    state, decision["action"], decision["payload"], actor, meta
                )

            if state["phase"] == "GAME_OVER":
                break

            # NAMING TRUMP
            assert state["phase"] == "NAMING_TRUMP"
            winner = state["current_hand"]["bidding"]["winning_seat"]
            decision = choose_trump(state["player_hands"][winner])
            meta = self._make_metadata(state, decision["action"], winner)
            state, _, _ = apply_action(
                state, decision["action"], decision["payload"], winner, meta
            )

            # PASSING CARDS
            assert state["phase"] == "PASSING_CARDS"
            passing = state["current_hand"]["card_passing"]
            for seat in [passing["bidder_seat"], passing["partner_seat"]]:
                trump = state["current_hand"]["trump_suit"]
                decision = choose_pass_cards(state["player_hands"][seat], trump)
                meta = self._make_metadata(state, decision["action"], seat)
                state, _, _ = apply_action(
                    state, decision["action"], decision["payload"], seat, meta
                )

            # SHOWING MELD
            assert state["phase"] == "SHOWING_MELD"
            for seat in SEATS:
                decision = choose_acknowledge()
                meta = self._make_metadata(state, decision["action"], seat)
                state, _, _ = apply_action(
                    state, decision["action"], decision["payload"], seat, meta
                )

            # TRICK PLAYING
            assert state["phase"] == "TRICK_PLAYING"
            for _ in range(48):
                if state["phase"] != "TRICK_PLAYING":
                    break
                trick_play = state["current_hand"]["trick_play"]
                actor = trick_play["next_to_act_seat"]
                decision = choose_card(state["player_hands"][actor], state, actor)
                meta = self._make_metadata(state, decision["action"], actor)
                state, _, _ = apply_action(
                    state, decision["action"], decision["payload"], actor, meta
                )

            # HAND COMPLETE
            assert state["phase"] == "HAND_COMPLETE"
            for seat in SEATS:
                decision = choose_acknowledge_hand_result()
                meta = self._make_metadata(state, decision["action"], seat)
                state, _, _ = apply_action(
                    state, decision["action"], decision["payload"], seat, meta
                )
            # Preserve bot_seats after new hand deal
            if "bot_seats" not in state:
                state["bot_seats"] = SEATS

            hands_played += 1

        assert state["phase"] == "GAME_OVER", (
            f"Game did not finish after {max_hands} hands. "
            f"Scores: {state.get('game_scores')}"
        )
        scores = state["game_scores"]
        assert scores["NS"] >= 150 or scores["EW"] >= 150


# ---------------------------------------------------------------------------
# _make_decision coverage
# ---------------------------------------------------------------------------


class TestMakeDecision:
    def test_returns_none_for_unknown_phase(self):
        state = {"phase": "LOBBY_WAITING", "player_hands": {}, "current_hand": {}}
        assert _make_decision(state, "NORTH") is None

    def test_returns_bid_for_bidding(self):
        state = {
            "phase": "BIDDING",
            "player_hands": {"EAST": ["AH"] * 12},
            "current_hand": {
                "bidding": {"winning_bid": None, "minimum_valid_bid": 25},
            },
        }
        result = _make_decision(state, "EAST")
        assert result is not None
        assert result["action"] == "SUBMIT_BID"

    def test_returns_trump_for_naming_trump(self):
        state = {
            "phase": "NAMING_TRUMP",
            "player_hands": {"NORTH": ["AH", "KH", "QH", "JH", "10H", "9H",
                                        "AS", "KS", "QS", "9D", "9C", "9D"]},
            "current_hand": {},
        }
        result = _make_decision(state, "NORTH")
        assert result is not None
        assert result["action"] == "DECLARE_TRUMP"

    def test_returns_card_for_trick_playing(self):
        state = {
            "phase": "TRICK_PLAYING",
            "player_hands": {"SOUTH": ["AH", "KH"]},
            "current_hand": {
                "trump_suit": "HEARTS",
                "trick_play": {
                    "cards_played": [],
                    "next_to_act_seat": "SOUTH",
                },
            },
        }
        result = _make_decision(state, "SOUTH")
        assert result is not None
        assert result["action"] == "PLAY_CARD"
        assert result["payload"]["card"] in ["AH", "KH"]
