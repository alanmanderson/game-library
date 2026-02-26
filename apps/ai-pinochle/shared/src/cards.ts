export const SUIT_ORDER: Record<string, number> = { C: 0, D: 1, H: 2, S: 3 };
export const RANK_ORDER: Record<string, number> = { "9": 0, J: 1, Q: 2, K: 3, "10": 4, A: 5 };

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
