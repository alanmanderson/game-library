import { SUIT_SYMBOLS } from "@pinochle/shared";
import styles from "./TrumpChip.module.css";

type Suit = "SPADES" | "CLUBS" | "HEARTS" | "DIAMONDS";

interface Props {
  suit: Suit;
  className?: string;
}

const SUIT_CLASS: Record<Suit, string> = {
  SPADES: "suit--spade",
  CLUBS: "suit--club",
  HEARTS: "suit--heart",
  DIAMONDS: "suit--diamond",
};

/**
 * Small "TRUMP" badge with a crown and the suit symbol. Used in and around
 * the table to advertise the current trump suit. Colors respect the
 * colorblind-safe `--suit-*` tokens for the suit symbol.
 */
export function TrumpChip({ suit, className }: Props) {
  const symbol = SUIT_SYMBOLS[suit] ?? "";
  const suitClass = styles[SUIT_CLASS[suit]] ?? "";
  return (
    <span
      className={[styles.chip, className ?? ""].filter(Boolean).join(" ")}
      aria-label={`Trump suit: ${suit.toLowerCase()}`}
    >
      <span aria-hidden="true" className={styles.crown}>
        &#9812;
      </span>
      <span>Trump</span>
      <span aria-hidden="true" className={`${styles.suit} ${suitClass}`}>
        {symbol}
      </span>
    </span>
  );
}
