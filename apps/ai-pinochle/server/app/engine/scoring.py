"""Hand scoring logic for Pinochle."""


def score_hand(
    bid: int,
    bidding_team: str,
    trick_scores: dict,
    tricks_taken: dict,
    team_meld: dict,
) -> dict:
    """Calculate score deltas for both teams at hand end.

    Rules:
    - A team that takes zero tricks scores 0 (no meld, no trick pts).
    - Bidding team: if meld + trick pts >= bid, scores that total; else -bid.
    - Non-bidding team: scores meld + trick pts (if they took any tricks).

    Returns:
        {"NS": int, "EW": int} score deltas.
    """
    other_team = "EW" if bidding_team == "NS" else "NS"
    deltas = {}

    # Bidding team
    if tricks_taken[bidding_team] == 0:
        deltas[bidding_team] = -bid
    else:
        total = team_meld[bidding_team] + trick_scores[bidding_team]
        deltas[bidding_team] = total if total >= bid else -bid

    # Non-bidding team
    if tricks_taken[other_team] == 0:
        deltas[other_team] = 0
    else:
        deltas[other_team] = team_meld[other_team] + trick_scores[other_team]

    return deltas
