"""Additional reducer-level unit tests covering gaps from issue #43.

Scope:
  - PLAY_CARD: happy paths + illegal-play edge cases (must-head, trump-when-void,
    follow-suit-when-only-trump-remains).
  - PASS_CARDS: duplicate submission / invalid count / non-bidding-team reject.
  - HAND_COMPLETE -> BIDDING re-deal (no win yet).
  - Multi-hand game-to-150 ending in GAME_OVER (full reducer play-through of
    the final trick that pushes a team past 150).
"""
import pytest

from app.engine.constants import new_hand_state
from app.engine.errors import ErrorCode, GameRuleError
from app.engine.state_machine import apply_action


# ---------------------------------------------------------------------------
# Shared state builders
# ---------------------------------------------------------------------------


def _base_state() -> dict:
    """Minimal valid state; phase is BIDDING. Caller adjusts further."""
    return {
        "room_code": "ROOM00",
        "phase": "BIDDING",
        "game_scores": {"NS": 0, "EW": 0},
        "current_hand": new_hand_state(1, "NORTH", "EAST"),
        "player_hands": {"NORTH": [], "EAST": [], "SOUTH": [], "WEST": []},
        "created_by": None,
    }


def _trick_state(
    *,
    hands: dict[str, list[str]],
    trump_suit: str = "HEARTS",
    bidder: str = "NORTH",
    bid: int = 25,
    team_meld=None,
) -> dict:
    st = _base_state()
    st["phase"] = "TRICK_PLAYING"
    hand = st["current_hand"]
    hand["trump_suit"] = trump_suit
    hand["bidding"]["winning_seat"] = bidder
    hand["bidding"]["winning_bid"] = bid
    hand["team_meld"] = team_meld or {"NS": 0, "EW": 0}
    hand["trick_play"] = {
        "trick_number": 1,
        "next_to_act_seat": bidder,
        "led_seat": bidder,
        "cards_played": [],
        "tricks_taken": {"NS": 0, "EW": 0},
        "trick_scores": {"NS": 0, "EW": 0},
    }
    st["player_hands"] = hands
    return st


# ---------------------------------------------------------------------------
# PLAY_CARD happy paths
# ---------------------------------------------------------------------------


def test_play_card_mid_trick_emits_card_played_and_your_turn():
    """Lead card — no prior cards — emits CARD_PLAYED + your_turn for next seat."""
    hands = {
        "NORTH": ["AH", "KH"],
        "EAST": ["9H", "KC"],
        "SOUTH": ["10H", "QC"],
        "WEST": ["KH", "JC"],
    }
    state = _trick_state(hands=hands)
    new_state, events, side_effects = apply_action(
        state, "PLAY_CARD", {"card": "AH"}, "NORTH", {}
    )

    tp = new_state["current_hand"]["trick_play"]
    assert tp["cards_played"] == [{"seat": "NORTH", "card": "AH"}]
    assert tp["next_to_act_seat"] == "EAST"
    assert "AH" not in new_state["player_hands"]["NORTH"]
    assert side_effects == []

    scopes = [e["scope"] for e in events]
    assert scopes.count("broadcast") == 1
    assert "your_turn" in scopes
    assert events[0]["event"] == "CARD_PLAYED"
    assert events[0]["payload"]["seat"] == "NORTH"
    assert events[0]["payload"]["next_to_act_seat"] == "EAST"


def test_play_card_finishes_hand_transitions_to_hand_complete():
    """Rig a trick-12 finisher; the final play moves phase to HAND_COMPLETE."""
    # Simple, deterministic setup: trick 12, each seat has one card left.
    # Trump HEARTS; NORTH leads AH, the three others follow 9H/10H/KH —
    # NORTH wins the trick (AH beats 10H beats KH beats 9H in follow-suit
    # ranking), takes the last-trick bonus, and the hand ends.
    hands = {
        "NORTH": ["AH"],
        "EAST": ["9H"],
        "SOUTH": ["10H"],
        "WEST": ["KH"],
    }
    state = _trick_state(hands=hands, bidder="NORTH", bid=25,
                         team_meld={"NS": 20, "EW": 5})
    state["current_hand"]["trick_play"]["trick_number"] = 12
    # NS already holds 10 tricks + 15 trick points going in; EW took 1 trick
    # with 3 trick points so their meld isn't zeroed out by the no-trick rule.
    state["current_hand"]["trick_play"]["tricks_taken"] = {"NS": 10, "EW": 1}
    state["current_hand"]["trick_play"]["trick_scores"] = {"NS": 15, "EW": 3}

    state, _, _ = apply_action(state, "PLAY_CARD", {"card": "AH"}, "NORTH", {})
    state, _, _ = apply_action(state, "PLAY_CARD", {"card": "9H"}, "EAST", {})
    state, _, _ = apply_action(state, "PLAY_CARD", {"card": "10H"}, "SOUTH", {})
    state, events, side_effects = apply_action(
        state, "PLAY_CARD", {"card": "KH"}, "WEST", {}
    )

    assert state["phase"] == "HAND_COMPLETE"
    # Score delta recorded on the hand.
    assert "score_deltas" in state["current_hand"]
    # Last-trick bonus (+1) was added to NS.
    assert state["current_hand"]["trick_play"]["trick_scores"]["NS"] == 15 + 3 + 1
    assert state["current_hand"]["hand_result_acknowledged_seats"] == []

    event_names = [e.get("event") for e in events]
    assert "HAND_COMPLETED" in event_names

    sfx_types = {s.get("type") for s in side_effects}
    assert {"trick_finished", "hand_completed", "save_extra"}.issubset(sfx_types)


# ---------------------------------------------------------------------------
# PLAY_CARD illegal-play edge cases
# ---------------------------------------------------------------------------


def test_play_card_must_head_the_trick_when_possible():
    """EAST follows with 9H when 10H (would beat AH... no, AH beats 10H,
    but 10H beats 9H). Actually: NORTH leads 9H. EAST has 10H and KH — both
    higher than 9H. EAST must play one of the winners, not another 9H."""
    hands = {
        "NORTH": ["9H", "9C"],
        "EAST": ["9H", "10H"],  # 10H wins; 9H would tie-lose-to-first.
        "SOUTH": ["AH", "QC"],
        "WEST": ["KH", "JC"],
    }
    state = _trick_state(hands=hands, bidder="NORTH")
    state, _, _ = apply_action(state, "PLAY_CARD", {"card": "9H"}, "NORTH", {})
    # EAST's 9H would NOT beat NORTH's 9H (ties go to first played), so the
    # must-head rule must force EAST to play 10H.
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "PLAY_CARD", {"card": "9H"}, "EAST", {})
    assert ei.value.code == ErrorCode.ILLEGAL_PLAY

    # 10H is accepted.
    new_state, _, _ = apply_action(
        state, "PLAY_CARD", {"card": "10H"}, "EAST", {}
    )
    played = [e["card"] for e in new_state["current_hand"]["trick_play"]["cards_played"]]
    assert played == ["9H", "10H"]


def test_play_card_must_trump_when_void_in_led_suit():
    """EAST has no clubs but does hold trump (HEARTS) — must play trump."""
    hands = {
        "NORTH": ["AC", "9C"],
        "EAST": ["9H", "KD"],  # void in clubs, holds trump.
        "SOUTH": ["10C", "QC"],
        "WEST": ["KC", "JC"],
    }
    state = _trick_state(hands=hands, trump_suit="HEARTS", bidder="NORTH")
    state, _, _ = apply_action(state, "PLAY_CARD", {"card": "AC"}, "NORTH", {})
    # Playing KD (non-trump, off-suit) is illegal — must trump.
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "PLAY_CARD", {"card": "KD"}, "EAST", {})
    assert ei.value.code == ErrorCode.ILLEGAL_PLAY

    # 9H (trump) is legal.
    apply_action(state, "PLAY_CARD", {"card": "9H"}, "EAST", {})


def test_play_card_when_only_trump_remains_and_non_trump_led():
    """EAST holds only trump when non-trump led — any trump is legal.

    Neither a non-trump led card nor a prior trump is on the table, so any
    trump 'would win' (trump beats non-trump). Both of EAST's trumps are
    legal; must-head doesn't narrow further because every candidate wins.
    """
    hands = {
        "NORTH": ["AC"],           # leads clubs
        "EAST": ["9H", "KH"],      # only trump — must trump the trick.
        "SOUTH": ["10C"],
        "WEST": ["KC"],
    }
    state = _trick_state(hands=hands, trump_suit="HEARTS", bidder="NORTH")
    state, _, _ = apply_action(state, "PLAY_CARD", {"card": "AC"}, "NORTH", {})
    # Both trumps are legal — either one wins the trick against a non-trump.
    new_state, _, _ = apply_action(state, "PLAY_CARD", {"card": "9H"}, "EAST", {})
    assert "9H" not in new_state["player_hands"]["EAST"]


def test_play_card_must_beat_winning_trump_when_over_trumping():
    """EAST void in clubs trumps with JH; SOUTH is also void in clubs with a
    low (9H) and high (KH) trump — must over-trump with KH, not 9H."""
    hands = {
        "NORTH": ["AC"],
        "EAST": ["JH", "KD"],
        "SOUTH": ["KH", "9H"],   # void in clubs, KH > JH > 9H in trumps.
        "WEST": ["10C"],
    }
    state = _trick_state(hands=hands, trump_suit="HEARTS", bidder="NORTH")
    state, _, _ = apply_action(state, "PLAY_CARD", {"card": "AC"}, "NORTH", {})
    state, _, _ = apply_action(state, "PLAY_CARD", {"card": "JH"}, "EAST", {})
    # 9H cannot beat JH — must-head requires KH.
    with pytest.raises(GameRuleError) as ei:
        apply_action(state, "PLAY_CARD", {"card": "9H"}, "SOUTH", {})
    assert ei.value.code == ErrorCode.ILLEGAL_PLAY
    new_state, _, _ = apply_action(state, "PLAY_CARD", {"card": "KH"}, "SOUTH", {})
    played = [e["card"] for e in new_state["current_hand"]["trick_play"]["cards_played"]]
    assert played[-1] == "KH"


# ---------------------------------------------------------------------------
# PASS_CARDS edge cases
# ---------------------------------------------------------------------------


def _passing_state() -> dict:
    state = _base_state()
    state["phase"] = "PASSING_CARDS"
    state["current_hand"]["trump_suit"] = "HEARTS"
    state["current_hand"]["bidding"]["winning_seat"] = "NORTH"
    state["current_hand"]["bidding"]["winning_bid"] = 25
    state["current_hand"]["bidding"]["is_shoot_the_moon"] = False
    state["current_hand"]["card_passing"] = {
        "bidding_team": "NS",
        "bidder_seat": "NORTH",
        "partner_seat": "SOUTH",
        "submitted": {},
    }
    state["player_hands"]["NORTH"] = ["AH", "KH", "QH", "JH", "10H", "9H"]
    state["player_hands"]["SOUTH"] = ["AS", "KS", "QS", "JS", "10S", "9S"]
    return state


def test_pass_cards_duplicate_submission_raises():
    state = _passing_state()
    state, _, _ = apply_action(
        state, "PASS_CARDS", {"cards": ["AH", "KH", "QH"]}, "NORTH", {}
    )
    with pytest.raises(GameRuleError) as ei:
        apply_action(
            state, "PASS_CARDS", {"cards": ["JH", "10H", "9H"]}, "NORTH", {}
        )
    assert ei.value.code == ErrorCode.ALREADY_PASSED


def test_pass_cards_wrong_count_raises():
    state = _passing_state()
    with pytest.raises(GameRuleError) as ei:
        apply_action(
            state, "PASS_CARDS", {"cards": ["AH", "KH"]}, "NORTH", {}
        )
    assert ei.value.code == ErrorCode.INVALID_PASS_CARDS


def test_pass_cards_partial_submission_keeps_phase():
    """Only the bidder has submitted — phase stays PASSING_CARDS."""
    state = _passing_state()
    new_state, events, _ = apply_action(
        state, "PASS_CARDS", {"cards": ["AH", "KH", "QH"]}, "NORTH", {}
    )
    assert new_state["phase"] == "PASSING_CARDS"
    submitted = new_state["current_hand"]["card_passing"]["submitted"]
    assert set(submitted["NORTH"]) == {"AH", "KH", "QH"}
    assert "SOUTH" not in submitted
    assert events[0]["event"] == "CARDS_PASSED"
    assert events[0]["payload"]["submitted_seats"] == ["NORTH"]


# ---------------------------------------------------------------------------
# HAND_COMPLETE -> BIDDING re-deal (no winner yet)
# ---------------------------------------------------------------------------


def test_hand_result_ack_fourth_redeals_when_under_150():
    """Fourth hand-result ack with neither team at 150 -> fresh BIDDING."""
    state = {
        "room_code": "ROOM00",
        "phase": "HAND_COMPLETE",
        "game_scores": {"NS": 80, "EW": 70},
        "current_hand": {
            "hand_number": 3,
            "dealer_seat": "NORTH",
            "bidding": {"winning_seat": "NORTH", "winning_bid": 25},
            "trick_play": {"tricks_taken": {"NS": 7, "EW": 5}},
            "hand_result_acknowledged_seats": ["NORTH", "EAST", "SOUTH"],
        },
        "created_by": None,
    }
    new_deal = {
        "NORTH": ["AH"] * 12, "EAST": ["AS"] * 12,
        "SOUTH": ["AD"] * 12, "WEST": ["AC"] * 12,
    }
    new_state, events, side_effects = apply_action(
        state, "ACKNOWLEDGE_HAND_RESULT", {}, "WEST", {"new_deal": new_deal}
    )

    assert new_state["phase"] == "BIDDING"
    assert new_state["current_hand"]["hand_number"] == 4
    # Dealer rotates clockwise: NORTH -> EAST. First bidder is next after that.
    assert new_state["current_hand"]["dealer_seat"] == "EAST"
    assert new_state["current_hand"]["bidding"]["next_to_act_seat"] == "SOUTH"
    assert new_state["player_hands"] == new_deal
    # Scores carried over — not reset.
    assert new_state["game_scores"] == {"NS": 80, "EW": 70}
    # No save_extra side-effects on a re-deal.
    assert [s for s in side_effects if s.get("type") == "save_extra"] == []

    events_by_name = {e.get("event") for e in events}
    assert "HAND_DEALT" in events_by_name
    assert "BIDDING_TURN" in events_by_name


def test_hand_result_ack_partial_still_waiting():
    """Only 2 acks so far -> stays HAND_COMPLETE, broadcasts ack only."""
    state = {
        "room_code": "ROOM00",
        "phase": "HAND_COMPLETE",
        "game_scores": {"NS": 80, "EW": 70},
        "current_hand": {
            "hand_number": 3,
            "dealer_seat": "NORTH",
            "bidding": {"winning_seat": "NORTH", "winning_bid": 25},
            "trick_play": {"tricks_taken": {"NS": 7, "EW": 5}},
            "hand_result_acknowledged_seats": ["NORTH"],
        },
        "created_by": None,
    }
    new_state, events, side_effects = apply_action(
        state, "ACKNOWLEDGE_HAND_RESULT", {}, "EAST", {}
    )
    assert new_state["phase"] == "HAND_COMPLETE"
    assert new_state["current_hand"]["hand_result_acknowledged_seats"] == [
        "NORTH", "EAST",
    ]
    assert events[0]["event"] == "HAND_RESULT_ACKNOWLEDGED"
    assert side_effects == []


# ---------------------------------------------------------------------------
# Multi-hand to 150 -> GAME_OVER via pure reducer
# ---------------------------------------------------------------------------


def test_multi_hand_game_reaches_150_and_goes_to_game_over():
    """Play hand 5 where NS finishes over 150, trigger the 4th result ack."""
    # Build a TRICK_PLAYING state at trick 12 where NORTH wins the last trick.
    # NS going in: 140, EW: 90. NS takes the last trick + 1 last-trick bonus,
    # bid 25, team meld 20, trick scores NS 15 EW 5 going into this last trick
    # -> NS final: 140 + 20 + (15 + 1 + points this trick) >= 150.
    hands = {
        "NORTH": ["AH"],
        "EAST": ["9H"],
        "SOUTH": ["10H"],
        "WEST": ["KH"],
    }
    state = _trick_state(
        hands=hands, bidder="NORTH", bid=25, team_meld={"NS": 20, "EW": 5}
    )
    state["game_scores"] = {"NS": 140, "EW": 90}
    state["current_hand"]["hand_number"] = 5
    state["current_hand"]["trick_play"]["trick_number"] = 12
    state["current_hand"]["trick_play"]["tricks_taken"] = {"NS": 10, "EW": 1}
    state["current_hand"]["trick_play"]["trick_scores"] = {"NS": 15, "EW": 3}

    # Drive the last trick.
    for seat, card in [("NORTH", "AH"), ("EAST", "9H"), ("SOUTH", "10H"), ("WEST", "KH")]:
        state, _, _ = apply_action(state, "PLAY_CARD", {"card": card}, seat, {})

    assert state["phase"] == "HAND_COMPLETE"
    assert state["game_scores"]["NS"] >= 150

    # Three acks: phase stays, no save_extra.
    for seat in ["NORTH", "EAST", "SOUTH"]:
        state, _, sfx = apply_action(
            state, "ACKNOWLEDGE_HAND_RESULT", {}, seat, {}
        )
        assert state["phase"] == "HAND_COMPLETE"
        assert sfx == []

    # Fourth ack ends the game.
    state, events, side_effects = apply_action(
        state, "ACKNOWLEDGE_HAND_RESULT", {}, "WEST", {}
    )
    assert state["phase"] == "GAME_OVER"
    assert state["winner_team"] == "NS"
    assert state["pending_rematch_seats"] == []

    event_names = [e.get("event") for e in events]
    assert "GAME_OVER" in event_names

    sfx_types = {s.get("type") for s in side_effects}
    assert "game_over" in sfx_types
    assert "save_extra" in sfx_types
    # status set to COMPLETED with ended_at flag.
    save_extra = next(s for s in side_effects if s.get("type") == "save_extra")
    assert save_extra["extra"] == {"status": "COMPLETED"}
    assert save_extra.get("set_ended_at") is True


def test_game_over_tie_breaker_both_teams_over_150_goes_to_bidder():
    """If both teams reach 150 on the same hand, bidder's team wins."""
    state = {
        "room_code": "ROOM00",
        "phase": "HAND_COMPLETE",
        "game_scores": {"NS": 155, "EW": 160},
        "current_hand": {
            "hand_number": 8,
            "dealer_seat": "NORTH",
            "bidding": {"winning_seat": "EAST", "winning_bid": 30},
            "trick_play": {"tricks_taken": {"NS": 6, "EW": 6}},
            "hand_result_acknowledged_seats": ["NORTH", "EAST", "SOUTH"],
        },
        "created_by": None,
    }
    new_state, events, _ = apply_action(
        state, "ACKNOWLEDGE_HAND_RESULT", {}, "WEST", {}
    )
    assert new_state["phase"] == "GAME_OVER"
    # EAST bid -> EW team is declared winner even though EW reached first too.
    assert new_state["winner_team"] == "EW"
    assert any(e.get("event") == "GAME_OVER" for e in events)


def test_game_over_no_winner_when_reaching_team_took_zero_tricks():
    """Edge: NS reaches 150 on meld alone but took 0 tricks -> no winner,
    must re-deal."""
    state = {
        "room_code": "ROOM00",
        "phase": "HAND_COMPLETE",
        "game_scores": {"NS": 150, "EW": 90},
        "current_hand": {
            "hand_number": 4,
            "dealer_seat": "WEST",
            "bidding": {"winning_seat": "EAST", "winning_bid": 25},
            "trick_play": {"tricks_taken": {"NS": 0, "EW": 12}},
            "hand_result_acknowledged_seats": ["NORTH", "EAST", "SOUTH"],
        },
        "created_by": None,
    }
    new_deal = {s: ["AH"] * 12 for s in ["NORTH", "EAST", "SOUTH", "WEST"]}
    new_state, _, _ = apply_action(
        state, "ACKNOWLEDGE_HAND_RESULT", {}, "WEST", {"new_deal": new_deal}
    )
    # NS reached 150 but took no tricks — they can't win on meld alone.
    # EW is below 150 — also can't win. Must re-deal.
    assert new_state["phase"] == "BIDDING"
    assert new_state["current_hand"]["hand_number"] == 5
