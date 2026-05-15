"""ACKNOWLEDGE_MELD reducer: collect 4 acks, then enter TRICK_PLAYING.

The adapter emits the bid winner's YOUR_TURN event using shared helpers
since computing legal cards depends on state we just wrote.
"""
from app.engine.errors import ErrorCode, GameRuleError


def reduce(state: dict, payload: dict, actor_seat, metadata: dict):
    if state.get("phase") != "SHOWING_MELD":
        raise GameRuleError(
            ErrorCode.WRONG_PHASE, "Game is not in the meld showing phase"
        )
    if actor_seat is None:
        raise GameRuleError(ErrorCode.NOT_SEATED, "You are not seated in this game")

    hand = state["current_hand"]
    acked = hand["meld_acknowledged_seats"]
    if actor_seat in acked:
        raise GameRuleError(
            ErrorCode.ALREADY_ACKNOWLEDGED, "You have already acknowledged meld"
        )

    acked.append(actor_seat)
    hand["meld_acknowledged_seats"] = acked

    if len(acked) >= 4:
        bid_winner = hand["bidding"]["winning_seat"]
        hand["trick_play"] = {
            "trick_number": 1,
            "next_to_act_seat": bid_winner,
            "led_seat": bid_winner,
            "cards_played": [],
            "tricks_taken": {"NS": 0, "EW": 0},
            "trick_scores": {"NS": 0, "EW": 0},
        }
        state["phase"] = "TRICK_PLAYING"

        events = [
            {
                "scope": "broadcast",
                "event": "MELD_PHASE_COMPLETED",
                "payload": {
                    "team_meld": hand["team_meld"],
                    "first_to_act_seat": bid_winner,
                },
            },
            {"scope": "your_turn", "seat": bid_winner},
        ]
        return state, events, []

    events = [{
        "scope": "broadcast",
        "event": "MELD_ACKNOWLEDGED",
        "payload": {
            "seat": actor_seat,
            "acknowledged_seats": list(acked),
        },
    }]
    return state, events, []
