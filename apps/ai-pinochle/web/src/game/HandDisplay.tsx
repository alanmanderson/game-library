import { cardSuit, sortHand, SUIT_LETTER } from "@pinochle/shared";
import styles from "./HandDisplay.module.css";

interface Props {
  cards: string[];
  trumpSuit: string | null;
  onCardClick?: (card: string) => void;
  legalCards?: string[];
}

function cardToImage(code: string): string {
  return `/img/${code}.png`;
}

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
