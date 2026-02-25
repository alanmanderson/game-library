import styles from "./HandDisplay.module.css";

interface Props {
  cards: string[];
  trumpSuit: string | null;
  onCardClick?: (card: string) => void;
  legalCards?: string[];
}

function cardToImage(code: string): string {
  return `/img/${code.toLowerCase()}.png`;
}

function cardSuit(code: string): string {
  return code.slice(-1);
}

function cardRank(code: string): string {
  return code.slice(0, -1);
}

const SUIT_ORDER: Record<string, number> = { C: 0, D: 1, H: 2, S: 3 };
const RANK_ORDER: Record<string, number> = { "9": 0, J: 1, Q: 2, K: 3, "10": 4, A: 5 };

function sortHand(cards: string[]): string[] {
  return [...cards].sort((a, b) => {
    const suitDiff = (SUIT_ORDER[cardSuit(a)] ?? 0) - (SUIT_ORDER[cardSuit(b)] ?? 0);
    if (suitDiff !== 0) return suitDiff;
    return (RANK_ORDER[cardRank(a)] ?? 0) - (RANK_ORDER[cardRank(b)] ?? 0);
  });
}

const SUIT_LETTER: Record<string, string> = {
  HEARTS: "H",
  DIAMONDS: "D",
  CLUBS: "C",
  SPADES: "S",
};

export function HandDisplay({ cards, trumpSuit, onCardClick, legalCards }: Props) {
  const trumpLetter = trumpSuit ? SUIT_LETTER[trumpSuit] ?? null : null;
  const sorted = sortHand(cards);
  const interactive = !!(onCardClick && legalCards);

  return (
    <div className={styles.hand}>
      {sorted.map((card, i) => {
        const isTrump = trumpLetter && cardSuit(card) === trumpLetter;
        const isLegal = !legalCards || legalCards.includes(card);
        const clickable = interactive && isLegal;

        const classes = [
          styles.card,
          interactive
            ? isLegal ? styles.legal : styles.disabled
            : isTrump ? styles.trump : "",
        ].filter(Boolean).join(" ");

        return (
          <img
            key={`${card}-${i}`}
            src={cardToImage(card)}
            alt={card}
            className={classes}
            onClick={clickable ? () => onCardClick!(card) : undefined}
          />
        );
      })}
    </div>
  );
}
