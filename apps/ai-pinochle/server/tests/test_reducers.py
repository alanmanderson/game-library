"""Unit tests for the pure state-machine reducers.

These tests bypass the WS layer entirely — they exercise the reducers as
plain functions with dict states. The goal is to prove phase transitions,
rule violations (GameRuleError), and legal transitions without touching the
DB, the event loop, or a WebSocket.
"""
import pytest

from app.engine.constants import new_hand_state
from app.engine.errors import ErrorCode, GameRuleError
from app.engine.state_machine import apply_action


# ---------------------------------------------------------------------------
# Fixtures — minimal state builders
# ---------------------------------------------------------------------------


def _bidding_state(first_bidder: str = "EAST", dealer: str = "NORTH") -> dict:
    return {
        "room_code": "ROOM00",
        "phase": "BIDDING",
        "game_scores": {"NS": 0, "EW": 0},
        "current_hand": new_hand_state(1, dealer, first_bidder),
        "player_hands": {
            "NORTH": ["AH"] * 12, "EAST": ["AH"] * 12,
            "SOUTH": ["AH"] * 12, "WEST": ["AH"] * 12,
        },
        "created_by": None,
    }


def _naming_trump_state(winning_seat: str = "EAST", winning_bid: int = 30) -> dict:
    st = _bidding_state()
    st["phase"] = "NAMING_TRUMP"
    st["current_hand"]["bidding"]["winning_seat"] = winning_seat
    st["current_hand"]["bidding"]["winning_bid"] = winning_bid
    return st


# ---------------------------------------------------------------------------
# SUBMIT_BID
# ---------------------------------------------------------------------------


def test_submit_bid_wrong_phase_raises():
    state = _bidding_state()
    state["phase"] = "LOBBY_WAITING"
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "SUBMIT_BID", {"amount": 25}, "EAST", {})
    assert ei.value.code == ErrorCode.WRONG_PHASE


def test_submit_bid_not_your_turn():
    state = _bidding_state(first_bidder="EAST")
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "SUBMIT_BID", {"amount": 25}, "SOUTH", {})
    assert ei.value.code == ErrorCode.NOT_YOUR_TURN


def test_submit_bid_too_low():
    state = _bidding_state(first_bidder="EAST")
    state["current_hand"]["bidding"]["winning_bid"] = 30
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "SUBMIT_BID", {"amount": 30}, "EAST", {})
    assert ei.value.code == ErrorCode.BID_TOO_LOW


def test_submit_bid_legal_advances_turn():
    state = _bidding_state(first_bidder="EAST")
    new_state, events, _ = apply_action(
        state, "SUBMIT_BID", {"amount": 25}, "EAST", {}
    )
    bidding = new_state["current_hand"]["bidding"]
    assert bidding["winning_bid"] == 25
    assert bidding["winning_seat"] == "EAST"
    assert bidding["next_to_act_seat"] == "SOUTH"
    # Exactly one BIDDING_TURN event broadcast
    assert len(events) == 1
    assert events[0]["event"] == "BIDDING_TURN"
    assert events[0]["payload"]["minimum_valid_bid"] == 26


def test_submit_bid_three_passes_enter_naming_trump():
    state = _bidding_state(first_bidder="EAST", dealer="NORTH")
    # EAST passes
    state, _, _ = apply_action(state, "SUBMIT_BID", {"amount": None}, "EAST", {})
    # SOUTH bids 25
    state, _, _ = apply_action(state, "SUBMIT_BID", {"amount": 25}, "SOUTH", {})
    # WEST passes
    state, _, _ = apply_action(state, "SUBMIT_BID", {"amount": None}, "WEST", {})
    # NORTH passes -> SOUTH wins, phase flips
    state, events, _ = apply_action(state, "SUBMIT_BID", {"amount": None}, "NORTH", {})
    assert state["phase"] == "NAMING_TRUMP"
    assert state["current_hand"]["bidding"]["winning_seat"] == "SOUTH"
    assert events[0]["event"] == "BIDDING_COMPLETED"


def test_submit_bid_all_pass_forces_dealer_to_25():
    """Three non-dealers passing auto-awards the dealer a forced 25 bid."""
    state = _bidding_state(first_bidder="EAST", dealer="NORTH")
    state, _, _ = apply_action(state, "SUBMIT_BID", {"amount": None}, "EAST", {})
    state, _, _ = apply_action(state, "SUBMIT_BID", {"amount": None}, "SOUTH", {})
    state, events, _ = apply_action(
        state, "SUBMIT_BID", {"amount": None}, "WEST", {}
    )
    # WEST's pass is the 3rd — phase flips immediately.
    assert state["phase"] == "NAMING_TRUMP"
    bidding = state["current_hand"]["bidding"]
    assert bidding["winning_seat"] == "NORTH"
    assert bidding["winning_bid"] == 25
    assert events[0]["event"] == "BIDDING_COMPLETED"


def test_submit_bid_dealer_cannot_pass_when_forced():
    """Guard-rail: a constructed state where dealer is up with 3 prior passes
    and no live bid must raise DEALER_MUST_BID (unreachable by normal flow,
    but the invariant is still enforced)."""
    state = _bidding_state(first_bidder="EAST", dealer="NORTH")
    bidding = state["current_hand"]["bidding"]
    bidding["passed_seats"] = ["EAST", "SOUTH", "WEST"]
    bidding["next_to_act_seat"] = "NORTH"
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "SUBMIT_BID", {"amount": None}, "NORTH", {})
    assert ei.value.code == ErrorCode.DEALER_MUST_BID


# ---------------------------------------------------------------------------
# DECLARE_TRUMP
# ---------------------------------------------------------------------------


def test_declare_trump_not_bid_winner():
    state = _naming_trump_state(winning_seat="EAST")
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "DECLARE_TRUMP", {"suit": "HEARTS"}, "NORTH", {})
    assert ei.value.code == ErrorCode.NOT_BID_WINNER


def test_declare_trump_invalid_suit():
    state = _naming_trump_state(winning_seat="EAST")
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "DECLARE_TRUMP", {"suit": "PURPLE"}, "EAST", {})
    assert ei.value.code == ErrorCode.INVALID_SUIT


def test_declare_trump_success_emits_analytics_side_effect():
    state = _naming_trump_state(winning_seat="EAST", winning_bid=30)
    new_state, events, side_effects = apply_action(
        state, "DECLARE_TRUMP", {"suit": "HEARTS"}, "EAST", {}
    )
    assert new_state["phase"] == "PASSING_CARDS"
    assert new_state["current_hand"]["trump_suit"] == "HEARTS"
    assert new_state["current_hand"]["card_passing"]["bidder_seat"] == "EAST"
    event_names = [e["event"] for e in events]
    assert "TRUMP_NAMED" in event_names
    assert "PASSING_PHASE_STARTED" in event_names
    assert any(sfx["type"] == "hand_created" for sfx in side_effects)


# ---------------------------------------------------------------------------
# PLAY_CARD
# ---------------------------------------------------------------------------


def _trick_playing_state() -> dict:
    """State with trump=HEARTS, NORTH leading a fresh trick. Hands rigged
    so NORTH holds AH, EAST holds 9H, SOUTH holds 10H, WEST holds KH."""
    st = _bidding_state()
    st["phase"] = "TRICK_PLAYING"
    hand = st["current_hand"]
    hand["trump_suit"] = "HEARTS"
    hand["bidding"]["winning_seat"] = "NORTH"
    hand["bidding"]["winning_bid"] = 25
    hand["team_meld"] = {"NS": 10, "EW": 5}
    hand["trick_play"] = {
        "trick_number": 1,
        "next_to_act_seat": "NORTH",
        "led_seat": "NORTH",
        "cards_played": [],
        "tricks_taken": {"NS": 0, "EW": 0},
        "trick_scores": {"NS": 0, "EW": 0},
    }
    st["player_hands"] = {
        "NORTH": ["AH", "9C"],
        "EAST": ["9H", "KC"],
        "SOUTH": ["10H", "QC"],
        "WEST": ["KH", "JC"],
    }
    return st


def test_play_card_illegal_when_not_following_suit():
    state = _trick_playing_state()
    # NORTH leads AH
    state, _, _ = apply_action(state, "PLAY_CARD", {"card": "AH"}, "NORTH", {})
    # EAST has 9H (hearts) — must follow. Playing KC should be rejected.
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "PLAY_CARD", {"card": "KC"}, "EAST", {})
    assert ei.value.code == ErrorCode.ILLEGAL_PLAY


def test_play_card_not_your_turn():
    state = _trick_playing_state()
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "PLAY_CARD", {"card": "9H"}, "EAST", {})
    assert ei.value.code == ErrorCode.NOT_YOUR_TURN


def test_play_card_invalid_card_payload():
    state = _trick_playing_state()
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "PLAY_CARD", {"card": None}, "NORTH", {})
    assert ei.value.code == ErrorCode.INVALID_CARD


def test_play_card_full_trick_advances_winner_and_emits_your_turn():
    state = _trick_playing_state()
    state, _, _ = apply_action(state, "PLAY_CARD", {"card": "AH"}, "NORTH", {})
    state, _, _ = apply_action(state, "PLAY_CARD", {"card": "9H"}, "EAST", {})
    state, _, _ = apply_action(state, "PLAY_CARD", {"card": "10H"}, "SOUTH", {})
    state, events, side_effects = apply_action(
        state, "PLAY_CARD", {"card": "KH"}, "WEST", {}
    )
    # AH beat 10H beat KH beat 9H; NORTH wins trick
    tp = state["current_hand"]["trick_play"]
    assert tp["tricks_taken"]["NS"] == 1
    assert tp["trick_number"] == 2
    assert tp["next_to_act_seat"] == "NORTH"
    scopes = [e["scope"] for e in events]
    assert "your_turn" in scopes
    assert any(s["type"] == "trick_finished" for s in side_effects)


# ---------------------------------------------------------------------------
# ACKNOWLEDGE_MELD
# ---------------------------------------------------------------------------


def test_acknowledge_meld_duplicate_raises():
    state = _bidding_state()
    state["phase"] = "SHOWING_MELD"
    state["current_hand"]["meld_acknowledged_seats"] = ["NORTH"]
    state["current_hand"]["team_meld"] = {"NS": 0, "EW": 0}
    state["current_hand"]["bidding"]["winning_seat"] = "NORTH"
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "ACKNOWLEDGE_MELD", {}, "NORTH", {})
    assert ei.value.code == ErrorCode.ALREADY_ACKNOWLEDGED


def test_acknowledge_meld_fourth_ack_transitions_to_trick_playing():
    state = _bidding_state()
    state["phase"] = "SHOWING_MELD"
    state["current_hand"]["trump_suit"] = "HEARTS"
    state["current_hand"]["bidding"]["winning_seat"] = "NORTH"
    state["current_hand"]["bidding"]["winning_bid"] = 25
    state["current_hand"]["team_meld"] = {"NS": 10, "EW": 0}
    state["current_hand"]["meld_acknowledged_seats"] = ["NORTH", "EAST", "SOUTH"]
    new_state, events, _ = apply_action(
        state, "ACKNOWLEDGE_MELD", {}, "WEST", {}
    )
    assert new_state["phase"] == "TRICK_PLAYING"
    assert new_state["current_hand"]["trick_play"]["next_to_act_seat"] == "NORTH"
    event_names = [e["event"] for e in events if e["scope"] == "broadcast"]
    assert "MELD_PHASE_COMPLETED" in event_names


# ---------------------------------------------------------------------------
# PASS_CARDS
# ---------------------------------------------------------------------------


def test_pass_cards_rejects_non_bidding_team():
    state = _bidding_state()
    state["phase"] = "PASSING_CARDS"
    state["current_hand"]["card_passing"] = {
        "bidding_team": "NS", "bidder_seat": "NORTH",
        "partner_seat": "SOUTH", "submitted": {},
    }
    with pytest.raises(GameRuleError) as ei:
        apply_action(
            state, "PASS_CARDS",
            {"cards": ["AH", "AH", "AH"]},
            "EAST", {},
        )
    assert ei.value.code == ErrorCode.NOT_BIDDING_TEAM


def test_pass_cards_card_not_in_hand():
    state = _bidding_state()
    state["phase"] = "PASSING_CARDS"
    state["current_hand"]["card_passing"] = {
        "bidding_team": "NS", "bidder_seat": "NORTH",
        "partner_seat": "SOUTH", "submitted": {},
    }
    state["player_hands"]["NORTH"] = ["AH", "KH", "QH"]
    with pytest.raises(GameRuleError) as ei:
        apply_action(
            state, "PASS_CARDS",
            {"cards": ["AH", "KH", "9C"]},  # 9C not in hand
            "NORTH", {},
        )
    assert ei.value.code == ErrorCode.CARD_NOT_IN_HAND


# ---------------------------------------------------------------------------
# ACKNOWLEDGE_HAND_RESULT
# ---------------------------------------------------------------------------


def test_hand_result_ack_fourth_triggers_game_over_when_score_reached():
    state = {
        "room_code": "ROOM00",
        "phase": "HAND_COMPLETE",
        "game_scores": {"NS": 160, "EW": 80},
        "current_hand": {
            "hand_number": 5,
            "dealer_seat": "NORTH",
            "bidding": {"winning_seat": "NORTH", "winning_bid": 30},
            "trick_play": {"tricks_taken": {"NS": 10, "EW": 2}},
            "hand_result_acknowledged_seats": ["NORTH", "EAST", "SOUTH"],
        },
        "created_by": None,
    }
    new_state, events, side_effects = apply_action(
        state, "ACKNOWLEDGE_HAND_RESULT", {}, "WEST",
        {"new_deal": {s: [] for s in ["NORTH", "EAST", "SOUTH", "WEST"]}},
    )
    assert new_state["phase"] == "GAME_OVER"
    assert new_state["winner_team"] == "NS"
    assert any(e["event"] == "GAME_OVER" for e in events if "event" in e)
    assert any(s.get("type") == "save_extra" for s in side_effects)


# ---------------------------------------------------------------------------
# REMATCH
# ---------------------------------------------------------------------------


def test_rematch_wrong_phase_raises():
    state = _bidding_state()
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "REMATCH_REQUEST", {}, "NORTH", {})
    assert ei.value.code == ErrorCode.REMATCH_NOT_AVAILABLE


def test_rematch_fourth_request_resets_game():
    state = {
        "room_code": "ROOM00",
        "phase": "GAME_OVER",
        "game_scores": {"NS": 155, "EW": 100},
        "winner_team": "NS",
        "pending_rematch_seats": ["NORTH", "EAST", "SOUTH"],
        "created_by": None,
    }
    metadata = {
        "new_deal": {s: [] for s in ["NORTH", "EAST", "SOUTH", "WEST"]},
        "new_dealer": "NORTH",
        "first_bidder": "EAST",
    }
    new_state, events, side_effects = apply_action(
        state, "REMATCH_REQUEST", {}, "WEST", metadata
    )
    assert new_state["phase"] == "BIDDING"
    assert new_state["game_scores"] == {"NS": 0, "EW": 0}
    assert new_state["current_hand"]["hand_number"] == 1
    event_names = [e["event"] for e in events if e.get("event")]
    assert "REMATCH_STARTED" in event_names
    assert "BIDDING_TURN" in event_names
    assert any(s.get("type") == "save_extra" for s in side_effects)


# ---------------------------------------------------------------------------
# Unknown action
# ---------------------------------------------------------------------------


def test_unknown_action_raises():
    state = _bidding_state()
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "DO_SOMETHING_ELSE", {}, "NORTH", {})
    assert ei.value.code == ErrorCode.UNKNOWN_ACTION
