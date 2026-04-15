"""PLAY_CARD reducer: the trick-playing loop.

Handles three sub-cases:
  1. Mid-trick play (cards < 4) — advance the seat, fire YOUR_TURN.
  2. Trick complete, hand not over — tally, advance winner, fire YOUR_TURN.
  3. Trick 12 complete — score the hand, advance to HAND_COMPLETE.

The adapter handles the `_send_your_turn` broadcast and analytics writes.
"""
from app.engine.constants import TEAM_FOR_SEAT, is_valid_card_code, next_seat
from app.engine.errors import ErrorCode, GameRuleError
from app.engine.meld import SUIT_LETTER
from app.engine.scoring import score_hand
from app.engine.tricks import (
    card_suit,
    get_legal_cards,
    trick_card_points,
    trick_winner,
)


def reduce(state: dict, payload: dict, actor_seat, metadata: dict):
    if state.get("phase") != "TRICK_PLAYING":
        raise GameRuleError(
            ErrorCode.WRONG_PHASE, "Game is not in the trick playing phase"
        )
    if actor_seat is None:
        raise GameRuleError(ErrorCode.NOT_SEATED, "You are not seated in this game")

    hand = state["current_hand"]
    trick_play = hand["trick_play"]

    if actor_seat != trick_play["next_to_act_seat"]:
        raise GameRuleError(ErrorCode.NOT_YOUR_TURN, "It is not your turn")

    card = payload.get("card")
    if not is_valid_card_code(card):
        raise GameRuleError(ErrorCode.INVALID_CARD, "Card must be a valid card code")

    player_hand = state["player_hands"][actor_seat]
    trump_letter = SUIT_LETTER[hand["trump_suit"]]
    cards_played = trick_play["cards_played"]
    led_suit = card_suit(cards_played[0]["card"]) if cards_played else None
    legal_cards = get_legal_cards(player_hand, led_suit, trump_letter, cards_played)

    if card not in legal_cards:
        raise GameRuleError(ErrorCode.ILLEGAL_PLAY, "That card is not a legal play")

    player_hand.remove(card)
    cards_played.append({"seat": actor_seat, "card": card})

    # --- Mid-trick: still collecting 4 cards ----------------------------------
    if len(cards_played) < 4:
        next_to_act = next_seat(actor_seat)
        trick_play["next_to_act_seat"] = next_to_act
        events = [
            {
                "scope": "broadcast",
                "event": "CARD_PLAYED",
                "payload": {
                    "seat": actor_seat,
                    "card": card,
                    "next_to_act_seat": next_to_act,
                },
            },
            {"scope": "your_turn", "seat": next_to_act},
        ]
        return state, events, []

    # --- Trick complete -------------------------------------------------------
    winner = trick_winner(cards_played, trump_letter)
    winner_seat = winner["seat"]
    winner_team = TEAM_FOR_SEAT[winner_seat]
    points = trick_card_points(cards_played)
    trick_number = trick_play["trick_number"]

    if trick_number == 12:
        points += 1  # last-trick bonus

    trick_play["trick_scores"][winner_team] += points
    trick_play["tricks_taken"][winner_team] += 1

    finished_trick = list(cards_played)

    if trick_number < 12:
        trick_play["trick_number"] = trick_number + 1
        trick_play["led_seat"] = winner_seat
        trick_play["next_to_act_seat"] = winner_seat
        trick_play["cards_played"] = []

        events = _trick_complete_events(
            actor_seat, card, trick_number, winner_seat, finished_trick, points, trick_play
        )
        events.append({"scope": "your_turn", "seat": winner_seat})
        side_effects = [{
            "type": "trick_finished",
            "trick_number": trick_number,
            "finished_trick": finished_trick,
            "winner_seat": winner_seat,
            "points": points,
        }]
        return state, events, side_effects

    # --- Hand complete (trick 12 over) ---------------------------------------
    bidding = hand["bidding"]
    bid = bidding["winning_bid"]
    bidding_team = TEAM_FOR_SEAT[bidding["winning_seat"]]

    score_deltas = score_hand(
        bid=bid,
        bidding_team=bidding_team,
        trick_scores=trick_play["trick_scores"],
        tricks_taken=trick_play["tricks_taken"],
        team_meld=hand["team_meld"],
        is_shoot_the_moon=bidding.get("is_shoot_the_moon", False),
    )

    game_scores = state["game_scores"]
    game_scores["NS"] += score_deltas["NS"]
    game_scores["EW"] += score_deltas["EW"]

    state["phase"] = "HAND_COMPLETE"
    hand["score_deltas"] = score_deltas
    hand["hand_result_acknowledged_seats"] = []

    events = _trick_complete_events(
        actor_seat, card, trick_number, winner_seat, finished_trick, points, trick_play
    )
    events.append({
        "scope": "broadcast",
        "event": "HAND_COMPLETED",
        "payload": {
            "trick_scores": trick_play["trick_scores"],
            "team_meld": hand["team_meld"],
            "bid": bid,
            "bidding_team": bidding_team,
            "score_deltas": score_deltas,
            "game_scores": dict(game_scores),
        },
    })

    side_effects = [
        {
            "type": "trick_finished",
            "trick_number": trick_number,
            "finished_trick": finished_trick,
            "winner_seat": winner_seat,
            "points": points,
        },
        {
            "type": "hand_completed",
            "score_deltas": score_deltas,
            "bidding_team": bidding_team,
            "bid": bid,
            "trick_scores": dict(trick_play["trick_scores"]),
            "team_meld": dict(hand["team_meld"]),
        },
    ]
    # Adapter saves extra columns on the hand-complete write for game score totals.
    state_extra = {
        "ns_total_score": game_scores["NS"],
        "ew_total_score": game_scores["EW"],
    }
    side_effects.append({"type": "save_extra", "extra": state_extra})
    return state, events, side_effects


def _trick_complete_events(
    sender_seat: str,
    card: str,
    trick_number: int,
    winner_seat: str,
    finished_trick: list,
    points: int,
    trick_play: dict,
) -> list[dict]:
    return [
        {
            "scope": "broadcast",
            "event": "CARD_PLAYED",
            "payload": {
                "seat": sender_seat,
                "card": card,
                "next_to_act_seat": None,
            },
        },
        {
            "scope": "broadcast",
            "event": "TRICK_COMPLETED",
            "payload": {
                "trick_number": trick_number,
                "winner_seat": winner_seat,
                "cards_played": finished_trick,
                "trick_points": points,
                "tricks_taken": dict(trick_play["tricks_taken"]),
                "trick_scores": dict(trick_play["trick_scores"]),
            },
        },
    ]
