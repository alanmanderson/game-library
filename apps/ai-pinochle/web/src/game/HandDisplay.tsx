import { memo, useLayoutEffect, useMemo, useRef } from "react";
import type { CardPlayed } from "@pinochle/shared";
import { cardSuit, cardLabel, sortHand, SUIT_LETTER } from "@pinochle/shared";
import { CardImage } from "./CardImage";
import { dealFromDeck } from "./animations";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { playSound } from "../audio/sounds";
import styles from "./HandDisplay.module.css";

// Must match DEAL_STAGGER_MS in ./animations.ts so each audible flip lines up
// with its visual counterpart.
const DEAL_STAGGER_MS = 40;

const SUIT_NAMES: Record<string, string> = {
  H: "Hearts",
  S: "Spades",
  D: "Diamonds",
  C: "Clubs",
};

function getIllegalReason(
  hand: string[],
  legalCards: string[],
  ledSuit: string | null,
  trumpSuit: string | null,
): string | null {
  if (!ledSuit) return null; // Leading -- all cards legal
  if (legalCards.length === hand.length) return null; // All legal

  // Must follow suit: player holds the led suit
  const hasLedSuit = hand.some((c) => cardSuit(c) === ledSuit);
  if (hasLedSuit) {
    return `Must follow suit (${SUIT_NAMES[ledSuit] ?? ledSuit})`;
  }

  // Must trump: player lacks led suit but holds trump
  const trumpChar = trumpSuit ? (SUIT_LETTER[trumpSuit] ?? trumpSuit) : null;
  const hasTrump = trumpChar ? hand.some((c) => cardSuit(c) === trumpChar) : false;
  if (hasTrump) {
    return "Must play a trump card";
  }

  return "Must beat the current trick";
}

interface Props {
  cards: string[];
  trumpSuit: string | null;
  onCardClick?: (card: string) => void;
  legalCards?: string[];
  currentTrick?: CardPlayed[];
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
  currentTrick,
}: Props) {
  const trumpLetter = trumpSuit ? SUIT_LETTER[trumpSuit] ?? null : null;
  // Memoize sortHand: `cards` is reference-stable across most renders, so we
  // skip the per-render allocation + sort of a 12-card array.
  const sorted = useMemo(() => sortHand(cards), [cards]);
  const interactive = !!(onCardClick && legalCards);

  const ledSuit = currentTrick && currentTrick.length > 0
    ? cardSuit(currentTrick[0].card)
    : null;
  const illegalReason = interactive && legalCards
    ? getIllegalReason(cards, legalCards, ledSuit, trumpSuit)
    : null;

  const reduced = useReducedMotion();
  // Multiset counts of cards held last render — Pinochle has duplicates (two
  // of each rank+suit) so a plain Set doesn't work. A card is "new" only if
  // this render has more copies of it than the previous render did.
  const prevCountsRef = useRef<Map<string, number>>(new Map());
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  // After paint, animate any cards that are new this render. Newly-dealt
  // hands (12 cards at once) cascade in with a stagger; a single replacement
  // card (e.g. from a pass) animates in alone. Cards the user just played
  // simply disappear from `sorted` — no exit animation needed since the
  // play-flight on the trick slot conveys the motion.
  useLayoutEffect(() => {
    const prev = prevCountsRef.current;
    const remaining = new Map(prev);
    const incoming: HTMLElement[] = [];

    sorted.forEach((card, i) => {
      const left = remaining.get(card) ?? 0;
      if (left > 0) {
        remaining.set(card, left - 1);
      } else {
        const el = cardRefs.current.get(`${card}-${i}`);
        if (el) incoming.push(el);
      }
    });

    incoming.forEach((el, i) => {
      dealFromDeck(el, i, reduced);
      // Schedule the click/flip sound at the same stagger; a single replacement
      // from a pass fires immediately (i=0). The deal sound cue is short
      // (~100ms) so even a full 12-card cascade finishes cleanly.
      const delay = i * DEAL_STAGGER_MS;
      if (delay === 0) {
        playSound("card_flip", { gain: 0.5 });
      } else {
        window.setTimeout(
          () => playSound("card_flip", { gain: 0.5 }),
          delay,
        );
      }
    });

    const next = new Map<string, number>();
    for (const c of sorted) next.set(c, (next.get(c) ?? 0) + 1);
    prevCountsRef.current = next;
  }, [sorted, reduced]);

  return (
    <>
      <div className={styles.hand}>
        {sorted.map((card, i) => {
          const isTrump = trumpLetter && cardSuit(card) === trumpLetter;
          const isLegal = !legalCards || legalCards.includes(card);
          const clickable = interactive && isLegal;
          const key = `${card}-${i}`;

          const classes = [
            styles.card,
            interactive
              ? isLegal ? styles.legal : styles.disabled
              : isTrump ? styles.trump : "",
          ].filter(Boolean).join(" ");

          return (
            <CardImage
              key={key}
              ref={(el) => {
                if (el) cardRefs.current.set(key, el);
                else cardRefs.current.delete(key);
              }}
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
      {illegalReason && (
        <p className={styles.hintBanner} role="status">
          {illegalReason}
        </p>
      )}
    </>
  );
});
