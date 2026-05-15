"""SUBMIT_BID reducer: handle a bid or a pass during the auction."""
from app.engine.deck import SEATS
from app.engine.errors import ErrorCode, GameRuleError


def _next_active_bidder(current_seat: str, passed_seats: list[str]) -> str:
    idx = SEATS.index(current_seat)
    for offset in range(1, 5):
        candidate = SEATS[(idx + offset) % 4]
        if candidate not in passed_seats:
            return candidate
    raise ValueError("No active bidders remaining")


def reduce(state: dict, payload: dict, actor_seat, metadata: dict):
    if state.get("phase") != "BIDDING":
        raise GameRuleError(
            ErrorCode.WRONG_PHASE, "Game is not in the bidding phase"
        )

    hand = state["current_hand"]
    bidding = hand["bidding"]
    next_seat = bidding["next_to_act_seat"]

    if actor_seat != next_seat:
        raise GameRuleError(ErrorCode.NOT_YOUR_TURN, "It is not your turn to bid")

    amount = payload.get("amount")
    passed_seats = bidding["passed_seats"]
    winning_bid = bidding["winning_bid"]
    dealer_seat = hand["dealer_seat"]
    auction = bidding.setdefault("auction", [])

    if amount is None:
        non_dealer_seats = [s for s in SEATS if s != dealer_seat]
        all_others_passed = all(s in passed_seats for s in non_dealer_seats)
        if next_seat == dealer_seat and all_others_passed and winning_bid is None:
            raise GameRuleError(
                ErrorCode.DEALER_MUST_BID,
                "Dealer must bid when all others have passed",
            )

        passed_seats.append(next_seat)
        bidding["passed_seats"] = passed_seats
        auction.append({"seat": next_seat, "bid_amount": None})

        if len(passed_seats) == 3:
            if winning_bid is None:
                bidding["winning_bid"] = 25
                bidding["winning_seat"] = dealer_seat
                # Forced bid — record it so analytics sees the dealer's bid.
                auction.append({"seat": dealer_seat, "bid_amount": 25})
            state["phase"] = "NAMING_TRUMP"
            events = [{
                "scope": "broadcast",
                "event": "BIDDING_COMPLETED",
                "payload": {
                    "winning_seat": bidding["winning_seat"],
                    "winning_bid": bidding["winning_bid"],
                    "is_shoot_the_moon": bidding["is_shoot_the_moon"],
                },
            }]
            return state, events, []

        bidding["next_to_act_seat"] = _next_active_bidder(next_seat, passed_seats)
        minimum = (winning_bid + 1) if winning_bid is not None else 25
        events = [{
            "scope": "broadcast",
            "event": "BIDDING_TURN",
            "payload": {
                "current_highest_bid": winning_bid,
                "highest_bidder_seat": bidding["winning_seat"],
                "next_to_act_seat": bidding["next_to_act_seat"],
                "minimum_valid_bid": minimum,
            },
        }]
        return state, events, []

    # Active bid (non-pass)
    if not isinstance(amount, int) or isinstance(amount, bool):
        raise GameRuleError(ErrorCode.INVALID_BID, "Bid amount must be an integer")

    minimum = (winning_bid + 1) if winning_bid is not None else 25
    if amount < minimum:
        raise GameRuleError(ErrorCode.BID_TOO_LOW, f"Bid must be at least {minimum}")

    if amount > 500:
        raise GameRuleError(ErrorCode.BID_TOO_HIGH, "Bid amount is unreasonably large")

    bidding["winning_bid"] = amount
    bidding["winning_seat"] = next_seat
    bidding["next_to_act_seat"] = _next_active_bidder(next_seat, passed_seats)
    auction.append({"seat": next_seat, "bid_amount": amount})

    events = [{
        "scope": "broadcast",
        "event": "BIDDING_TURN",
        "payload": {
            "current_highest_bid": amount,
            "highest_bidder_seat": next_seat,
            "next_to_act_seat": bidding["next_to_act_seat"],
            "minimum_valid_bid": amount + 1,
        },
    }]
    return state, events, []
