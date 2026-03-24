import { useState } from "react";
import type { BiddingResult } from "@pinochle/shared";
import { SUITS, SEAT_LABELS } from "@pinochle/shared";
import styles from "./TrumpPhase.module.css";

interface Props {
  biddingResult: BiddingResult;
  isBidWinner: boolean;
  sendMessage: (msg: Record<string, unknown>) => void;
}

export function TrumpPhase({ biddingResult, isBidWinner, sendMessage }: Props) {
  const [shootTheMoon, setShootTheMoon] = useState(false);

  function handleSelect(suit: string) {
    sendMessage({
      action: "DECLARE_TRUMP",
      payload: { suit, shoot_the_moon: shootTheMoon },
    });
  }

  if (!isBidWinner) {
    const label = SEAT_LABELS[biddingResult.winning_seat] ?? biddingResult.winning_seat;
    return (
      <div className={styles.container}>
        <h2 className={styles.title}>Naming Trump</h2>
        <p className={styles.waiting}>
          Waiting for <strong>{label}</strong> to declare trump...
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Choose Trump Suit</h2>
      <p className={styles.subtitle}>
        You won the bid with <strong>{biddingResult.winning_bid}</strong>
      </p>

      <div className={styles.suits}>
        {SUITS.map((s) => (
          <button
            key={s.key}
            className={styles.suitButton}
            style={{ color: s.color }}
            onClick={() => handleSelect(s.key)}
          >
            <span className={styles.suitSymbol}>{s.symbol}</span>
            <span className={styles.suitName}>{s.key}</span>
          </button>
        ))}
      </div>

      <label className={styles.moonLabel}>
        <input
          type="checkbox"
          checked={shootTheMoon}
          onChange={(e) => setShootTheMoon(e.target.checked)}
        />
        Shoot the Moon
      </label>
    </div>
  );
}
