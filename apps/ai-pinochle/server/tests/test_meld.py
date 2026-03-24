from app.engine.meld import calculate_melds


def _total(melds):
    return sum(m["points"] for m in melds)


def _names(melds):
    return [m["name"] for m in melds]


# ── No melds ──────────────────────────────────────────────────────────


def test_no_melds():
    """Hand with no melds scores 0."""
    # No pairs of K-Q same suit, no arounds, no pinochle, no runs, no 9 of trump
    hand = ["9H", "9D", "JH", "QD", "KS", "AC", "10C", "10D", "JC", "KH", "QC", "AS"]
    melds = calculate_melds(hand, "CLUBS")
    # 9 of clubs would be Dix but we have no 9C. No K-Q pairs of same suit.
    assert melds == []


# ── Dix ───────────────────────────────────────────────────────────────


def test_single_dix():
    hand = ["9H", "AH", "10D", "KS", "QC", "JD", "AC", "10S", "KD", "QH", "JS", "9C"]
    melds = calculate_melds(hand, "HEARTS")
    dix = [m for m in melds if m["name"] == "Dix"]
    assert len(dix) == 1
    assert dix[0]["points"] == 1


def test_double_dix():
    hand = ["9H", "9H", "AH", "10D", "KS", "QC", "JD", "AC", "10S", "KD", "QD", "JS"]
    melds = calculate_melds(hand, "HEARTS")
    dix = [m for m in melds if m["name"] == "Dix"]
    assert len(dix) == 2
    assert sum(d["points"] for d in dix) == 2


# ── Marriages ─────────────────────────────────────────────────────────


def test_single_marriage():
    hand = ["KD", "QD", "9H", "AH", "10C", "JS", "AC", "10S", "9S", "JC", "9C", "10H"]
    melds = calculate_melds(hand, "HEARTS")
    marriages = [m for m in melds if m["name"] == "Marriage"]
    assert len(marriages) == 1
    assert marriages[0]["points"] == 2
    assert set(marriages[0]["cards"]) == {"KD", "QD"}


def test_royal_marriage():
    hand = ["KH", "QH", "9D", "AD", "10C", "JS", "AC", "10S", "9S", "JC", "9C", "10D"]
    melds = calculate_melds(hand, "HEARTS")
    royal = [m for m in melds if m["name"] == "Royal Marriage"]
    assert len(royal) == 1
    assert royal[0]["points"] == 4


def test_two_marriages_same_suit():
    hand = ["KD", "KD", "QD", "QD", "9H", "AH", "10C", "JS", "AC", "10S", "9S", "JC"]
    melds = calculate_melds(hand, "HEARTS")
    marriages = [m for m in melds if m["name"] == "Marriage"]
    assert len(marriages) == 2
    assert sum(m["points"] for m in marriages) == 4


# ── Pinochle ──────────────────────────────────────────────────────────


def test_single_pinochle():
    hand = ["JD", "QS", "9H", "AH", "10C", "KC", "AC", "10S", "9D", "KH", "9C", "10D"]
    melds = calculate_melds(hand, "HEARTS")
    pin = [m for m in melds if m["name"] == "Pinochle"]
    assert len(pin) == 1
    assert pin[0]["points"] == 4


def test_double_pinochle():
    hand = ["JD", "JD", "QS", "QS", "9H", "AH", "10C", "KC", "AC", "10S", "9D", "KH"]
    melds = calculate_melds(hand, "HEARTS")
    pin = [m for m in melds if m["name"] == "Double Pinochle"]
    assert len(pin) == 1
    assert pin[0]["points"] == 30
    # No single pinochle when double is present
    single = [m for m in melds if m["name"] == "Pinochle"]
    assert len(single) == 0


# ── Arounds ───────────────────────────────────────────────────────────


def test_aces_around():
    hand = ["AH", "AD", "AC", "AS", "9H", "10D", "KS", "QC", "JD", "10S", "KD", "9C"]
    melds = calculate_melds(hand, "HEARTS")
    aces = [m for m in melds if m["name"] == "Aces Around"]
    assert len(aces) == 1
    assert aces[0]["points"] == 10


def test_double_aces_around():
    hand = ["AH", "AH", "AD", "AD", "AC", "AC", "AS", "AS", "9H", "10D", "KS", "QC"]
    melds = calculate_melds(hand, "HEARTS")
    aces = [m for m in melds if m["name"] == "Double Aces Around"]
    assert len(aces) == 1
    assert aces[0]["points"] == 100
    # No single around when double is present
    single = [m for m in melds if m["name"] == "Aces Around"]
    assert len(single) == 0


def test_kings_around():
    hand = ["KH", "KD", "KC", "KS", "9H", "10D", "AS", "QC", "JD", "10S", "AD", "9C"]
    melds = calculate_melds(hand, "HEARTS")
    kings = [m for m in melds if m["name"] == "Kings Around"]
    assert len(kings) == 1
    assert kings[0]["points"] == 8


def test_double_kings_around():
    hand = ["KH", "KH", "KD", "KD", "KC", "KC", "KS", "KS", "9H", "10D", "AS", "QC"]
    melds = calculate_melds(hand, "HEARTS")
    kings = [m for m in melds if m["name"] == "Double Kings Around"]
    assert len(kings) == 1
    assert kings[0]["points"] == 80


def test_queens_around():
    hand = ["QH", "QD", "QC", "QS", "9H", "10D", "KS", "AC", "JD", "10S", "KD", "9C"]
    melds = calculate_melds(hand, "HEARTS")
    queens = [m for m in melds if m["name"] == "Queens Around"]
    assert len(queens) == 1
    assert queens[0]["points"] == 6


def test_double_queens_around():
    hand = ["QH", "QH", "QD", "QD", "QC", "QC", "QS", "QS", "9H", "10D", "KS", "AC"]
    melds = calculate_melds(hand, "HEARTS")
    queens = [m for m in melds if m["name"] == "Double Queens Around"]
    assert len(queens) == 1
    assert queens[0]["points"] == 60


def test_jacks_around():
    hand = ["JH", "JD", "JC", "JS", "9H", "10D", "KS", "QC", "AD", "10S", "KD", "9C"]
    melds = calculate_melds(hand, "HEARTS")
    jacks = [m for m in melds if m["name"] == "Jacks Around"]
    assert len(jacks) == 1
    assert jacks[0]["points"] == 4


def test_double_jacks_around():
    hand = ["JH", "JH", "JD", "JD", "JC", "JC", "JS", "JS", "9H", "10D", "KS", "QC"]
    melds = calculate_melds(hand, "HEARTS")
    jacks = [m for m in melds if m["name"] == "Double Jacks Around"]
    assert len(jacks) == 1
    assert jacks[0]["points"] == 40


# ── Runs ──────────────────────────────────────────────────────────────


def test_single_run():
    hand = ["AH", "10H", "KH", "QH", "JH", "9D", "AD", "10S", "KS", "QC", "JC", "9C"]
    melds = calculate_melds(hand, "HEARTS")
    runs = [m for m in melds if m["name"] == "Run"]
    assert len(runs) == 1
    assert runs[0]["points"] == 15


def test_double_run():
    hand = ["AH", "AH", "10H", "10H", "KH", "KH", "QH", "QH", "JH", "JH", "9D", "9C"]
    melds = calculate_melds(hand, "HEARTS")
    runs = [m for m in melds if m["name"] == "Double Run"]
    assert len(runs) == 1
    assert runs[0]["points"] == 150
    # No single run when double is present
    single = [m for m in melds if m["name"] == "Run"]
    assert len(single) == 0


# ── Run + Marriage interaction ────────────────────────────────────────


def test_run_blocks_royal_marriage():
    """A single run uses one K-Q of trump, so no Royal Marriage from that pair."""
    hand = ["AH", "10H", "KH", "QH", "JH", "9D", "AD", "10S", "KS", "QC", "JC", "9C"]
    melds = calculate_melds(hand, "HEARTS")
    royal = [m for m in melds if m["name"] == "Royal Marriage"]
    assert len(royal) == 0


def test_run_with_extra_kq_gives_royal_marriage():
    """A single run uses one K-Q, but a second K-Q of trump gets Royal Marriage."""
    hand = ["AH", "10H", "KH", "KH", "QH", "QH", "JH", "9D", "AD", "10S", "KS", "QC"]
    melds = calculate_melds(hand, "HEARTS")
    runs = [m for m in melds if m["name"] == "Run"]
    assert len(runs) == 1
    royal = [m for m in melds if m["name"] == "Royal Marriage"]
    assert len(royal) == 1
    assert royal[0]["points"] == 4


def test_double_run_blocks_royal_marriages():
    """Double run uses both K-Q pairs → no Royal Marriages."""
    hand = ["AH", "AH", "10H", "10H", "KH", "KH", "QH", "QH", "JH", "JH", "9D", "9C"]
    melds = calculate_melds(hand, "HEARTS")
    royal = [m for m in melds if m["name"] == "Royal Marriage"]
    assert len(royal) == 0


# ── Card reuse across meld types ──────────────────────────────────────


def test_king_in_around_and_marriage():
    """A King can count in Kings Around AND in a Marriage."""
    hand = ["KH", "KD", "KC", "KS", "QD", "9H", "10C", "JS", "AC", "10S", "AD", "9C"]
    melds = calculate_melds(hand, "HEARTS")
    kings = [m for m in melds if m["name"] == "Kings Around"]
    marriages = [m for m in melds if m["name"] == "Marriage"]
    assert len(kings) == 1
    assert len(marriages) == 1
    assert marriages[0]["cards"] == ["KD", "QD"]


# ── Combined melds ────────────────────────────────────────────────────


def test_combined_melds_total():
    """Run + Aces Around + Dix together."""
    hand = ["AH", "10H", "KH", "QH", "JH", "AD", "AC", "AS", "9H", "10D", "KS", "QC"]
    melds = calculate_melds(hand, "HEARTS")
    # Run (15) + Aces Around (10) + Dix (1) = 26
    assert _total(melds) == 26
    assert "Run" in _names(melds)
    assert "Aces Around" in _names(melds)
    assert "Dix" in _names(melds)


def test_run_and_pinochle():
    """Run in hearts + Pinochle (JD + QS)."""
    hand = ["AH", "10H", "KH", "QH", "JH", "JD", "QS", "9D", "10S", "KS", "AC", "9C"]
    melds = calculate_melds(hand, "HEARTS")
    assert "Run" in _names(melds)
    assert "Pinochle" in _names(melds)
    # Run (15) + Pinochle (4) + possible marriages
    assert _total(melds) >= 19


def test_double_run_with_dix():
    """Double Run subsumes both 9s of trump — Dix should not be scored separately."""
    hand = ["AH", "AH", "10H", "10H", "KH", "KH", "QH", "QH", "JH", "JH", "9H", "9H"]
    melds = calculate_melds(hand, "HEARTS")
    dix = [m for m in melds if m["name"] == "Dix"]
    assert len(dix) == 0
    assert _total(melds) == 150  # Double Run only, Dix subsumed


def test_empty_hand():
    melds = calculate_melds([], "HEARTS")
    assert melds == []


def test_queens_around_includes_pinochle_cards():
    """Queens Around uses QS, but Pinochle (JD+QS) can still form if extra QS exists."""
    hand = ["QH", "QD", "QC", "QS", "QS", "JD", "9H", "10D", "KS", "AC", "10S", "9C"]
    melds = calculate_melds(hand, "HEARTS")
    queens = [m for m in melds if m["name"] == "Queens Around"]
    assert len(queens) == 1
    pin = [m for m in melds if m["name"] == "Pinochle"]
    assert len(pin) == 1
    # Queens Around (6) + Pinochle (4) = 10
    assert _total(melds) >= 10
