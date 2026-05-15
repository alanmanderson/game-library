"""Hand scoring logic for Pinochle."""


def score_hand(
    bid: int,
    bidding_team: str,
    trick_scores: dict,
    tricks_taken: dict,
    team_meld: dict,
    is_shoot_the_moon: bool = False,
) -> dict:
    """Calculate score deltas for both teams at hand end.

    Rules:
    - A team that takes zero tricks scores 0 (no meld, no trick pts).
    - Bidding team: if meld + trick pts >= bid, scores that total; else -bid.
    - Non-bidding team: scores meld + trick pts (if they took any tricks).
    - Shoot the moon: bidding team must take all tricks. Success adds a
      50-point bonus; failure scores -bid.

    Returns:
        {"NS": int, "EW": int} score deltas.
    """
    other_team = "EW" if bidding_team == "NS" else "NS"
    deltas = {}

    if is_shoot_the_moon:
        total_tricks = tricks_taken[bidding_team] + tricks_taken[other_team]
        if tricks_taken[bidding_team] == total_tricks:
            deltas[bidding_team] = team_meld[bidding_team] + trick_scores[bidding_team] + 50
        else:
            deltas[bidding_team] = -bid
        deltas[other_team] = 0 if tricks_taken[other_team] == 0 else (
            team_meld[other_team] + trick_scores[other_team]
        )
        return deltas

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
