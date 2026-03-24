export const SUIT_ORDER: Record<string, number> = { C: 0, D: 1, H: 2, S: 3 };
export const RANK_ORDER: Record<string, number> = { "9": 0, J: 1, Q: 2, K: 3, "10": 4, A: 5 };

const RANK_NAMES: Record<string, string> = {
  "9": "Nine",
  J: "Jack",
  Q: "Queen",
  K: "King",
  "10": "Ten",
  A: "Ace",
};

const SUIT_NAMES: Record<string, string> = {
  C: "Clubs",
  D: "Diamonds",
  H: "Hearts",
  S: "Spades",
};

/** Returns a human-readable label for a card code, e.g. "AC" -> "Ace of Clubs". */
export function cardLabel(code: string): string {
  const suit = code.slice(-1);
  const rank = code.slice(0, -1);
  const rankName = RANK_NAMES[rank] ?? rank;
  const suitName = SUIT_NAMES[suit] ?? suit;
  return `${rankName} of ${suitName}`;
}

export const SUIT_LETTER: Record<string, string> = {
  HEARTS: "H",
  DIAMONDS: "D",
  CLUBS: "C",
  SPADES: "S",
};

export function cardSuit(code: string): string {
  return code.slice(-1);
}

export function cardRank(code: string): string {
  return code.slice(0, -1);
}

export function sortHand(cards: string[]): string[] {
  return [...cards].sort((a, b) => {
    const suitDiff = (SUIT_ORDER[cardSuit(a)] ?? 0) - (SUIT_ORDER[cardSuit(b)] ?? 0);
    if (suitDiff !== 0) return suitDiff;
    return (RANK_ORDER[cardRank(a)] ?? 0) - (RANK_ORDER[cardRank(b)] ?? 0);
  });
}
