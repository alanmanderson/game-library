import type { MeldData, Meld } from "@pinochle/shared";
import { SEAT_LABELS, SUIT_SYMBOLS, SEAT_ORDER } from "@pinochle/shared";
import styles from "./MeldPhase.module.css";

interface Props {
  meldData: MeldData;
  acknowledgedSeats: string[];
  hasAcknowledged: boolean;
  sendMessage: (msg: Record<string, unknown>) => void;
}

const SUIT_LETTER_TO_SYMBOL: Record<string, string> = {
  H: "\u2665",
  D: "\u2666",
  C: "\u2663",
  S: "\u2660",
};

function formatMeld(m: Meld): string {
  const suits = new Set(m.cards.map((c) => c.slice(-1)));
  if (suits.size === 1) {
    const symbol = SUIT_LETTER_TO_SYMBOL[[...suits][0]] ?? "";
    return `${m.name} (${symbol}): ${m.points}`;
  }
  return `${m.name}: ${m.points}`;
}

export function MeldPhase({
  meldData,
  acknowledgedSeats,
  hasAcknowledged,
  sendMessage,
}: Props) {
  function handleAcknowledge() {
    sendMessage({ action: "ACKNOWLEDGE_MELD", payload: {} });
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Meld</h2>

      <div className={styles.summary}>
        <p>
          Trump: <strong>{SUIT_SYMBOLS[meldData.trumpSuit]} {meldData.trumpSuit}</strong>
        </p>
        <p>
          Winning bid: <strong>{meldData.winningBid}</strong> ({meldData.biddingTeam})
        </p>
        <p>
          Team meld &mdash; NS: <strong>{meldData.teamMeld.NS}</strong>,
          EW: <strong>{meldData.teamMeld.EW}</strong>
        </p>
      </div>

      <div className={styles.playersGrid}>
        {SEAT_ORDER.map((seat) => {
          const pm = meldData.playerMelds[seat];
          if (!pm) return null;
          const acked = acknowledgedSeats.includes(seat);

          return (
            <div key={seat} className={styles.playerCard}>
              <div className={styles.playerHeader}>
                <span className={styles.playerName}>
                  {SEAT_LABELS[seat]}
                  {acked && <span className={styles.check}> &#10003;</span>}
                </span>
                <span className={styles.playerTotal}>{pm.total} pts</span>
              </div>
              {pm.melds.length === 0 ? (
                <p className={styles.noMelds}>No melds</p>
              ) : (
                <ul className={styles.meldList}>
                  {pm.melds.map((m, i) => (
                    <li key={i} className={styles.meldItem}>
                      {formatMeld(m)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <button
        className={styles.ackButton}
        onClick={handleAcknowledge}
        disabled={hasAcknowledged}
      >
        {hasAcknowledged ? "Acknowledged" : "Acknowledge"}
      </button>
    </div>
  );
}
