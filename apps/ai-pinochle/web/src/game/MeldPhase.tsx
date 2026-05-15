import type { MeldData, Meld } from "@pinochle/shared";
import { SEAT_LABELS, SUIT_SYMBOLS, SEAT_ORDER, sendAction } from "@pinochle/shared";
import styles from "./MeldPhase.module.css";

interface Props {
  meldData: MeldData;
  acknowledgedSeats: string[];
  hasAcknowledged: boolean;
  seatPlayers: Record<string, string | null>;
  sendMessage: (msg: Record<string, unknown>) => void;
}

const SUIT_LETTER_TO_SYMBOL: Record<string, string> = {
  H: "\u2665",
  D: "\u2666",
  C: "\u2663",
  S: "\u2660",
};

const MELD_DESCRIPTIONS: Record<string, string> = {
  "Run": "A-10-K-Q-J of trump",
  "Double Run": "Two runs in trump",
  "Aces Around": "An Ace in each suit",
  "Double Aces Around": "Two Aces in each suit",
  "Kings Around": "A King in each suit",
  "Double Kings Around": "Two Kings in each suit",
  "Queens Around": "A Queen in each suit",
  "Double Queens Around": "Two Queens in each suit",
  "Jacks Around": "A Jack in each suit",
  "Double Jacks Around": "Two Jacks in each suit",
  "Pinochle": "J\u2666 + Q\u2660",
  "Double Pinochle": "Two J\u2666 + two Q\u2660",
  "Royal Marriage": "K + Q of trump",
  "Marriage": "K + Q of same suit",
  "Dix": "9 of trump",
};

function formatMeld(m: Meld): string {
  const desc = MELD_DESCRIPTIONS[m.name];
  const suits = new Set(m.cards.map((c) => c.slice(-1)));
  const suitHint = suits.size === 1
    ? SUIT_LETTER_TO_SYMBOL[[...suits][0]] ?? ""
    : "";
  const detail = desc ?? suitHint;
  return detail
    ? `${m.name} (${detail}): ${m.points} pts`
    : `${m.name}: ${m.points} pts`;
}

export function MeldPhase({
  meldData,
  acknowledgedSeats,
  hasAcknowledged,
  seatPlayers,
  sendMessage,
}: Props) {
  function handleAcknowledge() {
    sendAction(sendMessage, { action: "ACKNOWLEDGE_MELD", payload: {} });
  }

  const waitingOn = SEAT_ORDER
    .filter((seat) => !acknowledgedSeats.includes(seat))
    .map((seat) => seatPlayers[seat.toLowerCase()] ?? SEAT_LABELS[seat]);

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Meld</h2>

      <div className={styles.summary}>
        <p>
          Trump: <strong>{SUIT_SYMBOLS[meldData.trump_suit]} {meldData.trump_suit}</strong>
        </p>
        <p>
          Winning bid: <strong>{meldData.winning_bid}</strong> ({meldData.bidding_team})
        </p>
        <p>
          Team meld &mdash; NS: <strong>{meldData.team_meld.NS}</strong>,
          EW: <strong>{meldData.team_meld.EW}</strong>
        </p>
      </div>

      <div className={styles.playersGrid}>
        {SEAT_ORDER.map((seat) => {
          const pm = meldData.player_melds[seat];
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
        {hasAcknowledged ? "Waiting for others" : "Acknowledge"}
      </button>
      {hasAcknowledged && waitingOn.length > 0 && (
        <p className={styles.waitingOn}>
          Waiting on: {waitingOn.join(", ")}
        </p>
      )}
    </div>
  );
}
