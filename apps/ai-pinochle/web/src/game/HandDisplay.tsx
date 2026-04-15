import { cardSuit, cardLabel, sortHand, SUIT_LETTER } from "@pinochle/shared";
import { CardImage } from "./CardImage";
import styles from "./HandDisplay.module.css";

interface Props {
  cards: string[];
  trumpSuit: string | null;
  onCardClick?: (card: string) => void;
  legalCards?: string[];
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
          <CardImage
            key={`${card}-${i}`}
            card={card}
            alt={cardLabel(card)}
            width={80}
            height={112}
            className={classes}
            onClick={clickable ? () => onCardClick!(card) : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCardClick!(card); } } : undefined}
            tabIndex={clickable ? 0 : undefined}
            role={clickable ? "button" : undefined}
            aria-label={clickable ? `Play ${cardLabel(card)}` : undefined}
          />
        );
      })}
    </div>
  );
}
