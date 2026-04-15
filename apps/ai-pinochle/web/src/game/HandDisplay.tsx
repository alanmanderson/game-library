import { memo, useMemo } from "react";
import { cardSuit, cardLabel, sortHand, SUIT_LETTER } from "@pinochle/shared";
import { CardImage } from "./CardImage";
import styles from "./HandDisplay.module.css";

interface Props {
  cards: string[];
  trumpSuit: string | null;
  onCardClick?: (card: string) => void;
  legalCards?: string[];
}

// Memoized: `cards` and `legalCards` keep reference identity across reducer
// updates that don't touch them, so most BID/MELD/turn-advance events skip
// this entire 12-card render. Caller must pass a stable `onCardClick` —
// `game.playCard` from useGameState is already useCallback-stable.
export const HandDisplay = memo(function HandDisplay({
  cards,
  trumpSuit,
  onCardClick,
  legalCards,
}: Props) {
  const trumpLetter = trumpSuit ? SUIT_LETTER[trumpSuit] ?? null : null;
  // Memoize sortHand: `cards` is reference-stable across most renders, so we
  // skip the per-render allocation + sort of a 12-card array.
  const sorted = useMemo(() => sortHand(cards), [cards]);
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
});
