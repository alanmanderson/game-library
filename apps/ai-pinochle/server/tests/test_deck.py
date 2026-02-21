from collections import Counter

from app.engine.deck import SEATS, create_deck, shuffle_and_deal


def test_create_deck_48_cards():
    deck = create_deck()
    assert len(deck) == 48


def test_create_deck_duplicates():
    deck = create_deck()
    counts = Counter(deck)
    for card, count in counts.items():
        assert count == 2, f"{card} appears {count} times, expected 2"


def test_shuffle_and_deal_12_per_player():
    hands = shuffle_and_deal()
    for seat in SEATS:
        assert len(hands[seat]) == 12, f"{seat} got {len(hands[seat])} cards"


def test_shuffle_and_deal_no_overlap():
    hands = shuffle_and_deal()
    all_cards = []
    for seat in SEATS:
        all_cards.extend(hands[seat])
    assert sorted(all_cards) == sorted(create_deck())
