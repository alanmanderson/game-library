"""ACKNOWLEDGE_HAND_RESULT reducer.

When the 4th ack arrives, either the game ends (one team >= 150 and tie-break
favors tricks-taken or bidding team) or the next hand is dealt.
"""
from app.engine.constants import TEAM_FOR_SEAT, new_hand_state, next_seat
from app.engine.errors import ErrorCode, GameRuleError

WIN_SCORE = 150


def reduce(state: dict, payload: dict, actor_seat, metadata: dict):
    if state.get("phase") != "HAND_COMPLETE":
        raise GameRuleError(
            ErrorCode.WRONG_PHASE, "Game is not in the hand complete phase"
        )
    if actor_seat is None:
        raise GameRuleError(ErrorCode.NOT_SEATED, "You are not seated in this game")

    hand = state["current_hand"]
    acked = hand.get("hand_result_acknowledged_seats", [])

    if actor_seat in acked:
        raise GameRuleError(
            ErrorCode.ALREADY_ACKNOWLEDGED,
            "You have already acknowledged the hand result",
        )

    acked.append(actor_seat)
    hand["hand_result_acknowledged_seats"] = acked

    if len(acked) < 4:
        events = [{
            "scope": "broadcast",
            "event": "HAND_RESULT_ACKNOWLEDGED",
            "payload": {
                "seat": actor_seat,
                "acknowledged_seats": list(acked),
            },
        }]
        return state, events, []

    # All 4 ack'd — check win condition.
    game_scores = state["game_scores"]
    ns_reached = game_scores["NS"] >= WIN_SCORE
    ew_reached = game_scores["EW"] >= WIN_SCORE

    if ns_reached or ew_reached:
        bidding_team = TEAM_FOR_SEAT[hand["bidding"]["winning_seat"]]
        tricks_taken = hand["trick_play"]["tricks_taken"]

        winner_team = None
        if ns_reached and ew_reached:
            winner_team = bidding_team
        elif ns_reached and tricks_taken["NS"] > 0:
            winner_team = "NS"
        elif ew_reached and tricks_taken["EW"] > 0:
            winner_team = "EW"

        if winner_team is not None:
            state["phase"] = "GAME_OVER"
            state["winner_team"] = winner_team
            state["pending_rematch_seats"] = []
            events = [{
                "scope": "broadcast",
                "event": "GAME_OVER",
                "payload": {
                    "winner_team": winner_team,
                    "final_scores": dict(game_scores),
                },
            }]
            side_effects = [
                {"type": "game_over"},
                {
                    "type": "save_extra",
                    "extra": {"status": "COMPLETED"},
                    "set_ended_at": True,
                },
            ]
            return state, events, side_effects

    # No winner — deal next hand. Adapter must provide the new deal in metadata.
    player_hands = metadata["new_deal"]
    new_dealer = next_seat(hand["dealer_seat"])
    first_bidder = next_seat(new_dealer)
    new_hand_number = hand["hand_number"] + 1

    state["current_hand"] = new_hand_state(new_hand_number, new_dealer, first_bidder)
    state["player_hands"] = player_hands
    state["phase"] = "BIDDING"

    events = [
        {
            "scope": "per_seat",
            "event": "HAND_DEALT",
            "payloads": {seat: {"cards": cards} for seat, cards in player_hands.items()},
        },
        {
            "scope": "broadcast",
            "event": "BIDDING_TURN",
            "payload": {
                "current_highest_bid": None,
                "highest_bidder_seat": None,
                "next_to_act_seat": first_bidder,
                "minimum_valid_bid": 25,
            },
        },
    ]
    return state, events, []
