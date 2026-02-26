import type { MeldData } from "@pinochle/shared";
import { SEAT_LABELS, SUIT_SYMBOLS, SEAT_ORDER } from "@pinochle/shared";
import styles from "./MeldPhase.module.css";

interface Props {
  meldData: MeldData;
  acknowledgedSeats: string[];
  hasAcknowledged: boolean;
  sendMessage: (msg: Record<string, unknown>) => void;
}

function cardToImage(code: string): string {
  return `/img/${code}.png`;
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
                      <span className={styles.meldName}>
                        {m.name} ({m.points})
                      </span>
                      <div className={styles.meldCards}>
                        {m.cards.map((c, j) => (
                          <img
                            key={j}
                            src={cardToImage(c)}
                            alt={c}
                            className={styles.meldCardImg}
                          />
                        ))}
                      </div>
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
