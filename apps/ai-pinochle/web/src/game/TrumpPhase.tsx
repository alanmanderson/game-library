import { useState } from "react";
import type { BiddingResult } from "@pinochle/shared";
import { SUITS, SEAT_LABELS, sendAction } from "@pinochle/shared";
import styles from "./TrumpPhase.module.css";

interface Props {
  biddingResult: BiddingResult;
  isBidWinner: boolean;
  sendMessage: (msg: Record<string, unknown>) => void;
}

export function TrumpPhase({ biddingResult, isBidWinner, sendMessage }: Props) {
  const [shootTheMoon, setShootTheMoon] = useState(false);
  const [pendingSuit, setPendingSuit] = useState<string | null>(null);

  function submit(suit: string, moon: boolean) {
    sendAction(sendMessage, {
      action: "DECLARE_TRUMP",
      payload: { suit, shoot_the_moon: moon },
    });
  }

  function handleSelect(suit: string) {
    if (shootTheMoon) {
      setPendingSuit(suit);
      return;
    }
    submit(suit, false);
  }

  function confirmMoon() {
    if (!pendingSuit) return;
    submit(pendingSuit, true);
    setPendingSuit(null);
  }

  const pendingSuitInfo = pendingSuit ? SUITS.find((s) => s.key === pendingSuit) : null;

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
      <p className={styles.moonExplain}>
        Shooting the moon means your team pledges to take every trick this hand.
        If you succeed, you score a massive bonus; if you miss even one trick, you go set for the full bid.
      </p>

      {pendingSuit && pendingSuitInfo && (
        <div className={styles.confirmBox} role="alertdialog" aria-labelledby="moonConfirmTitle">
          <p id="moonConfirmTitle" className={styles.confirmTitle}>
            Shoot the moon with{" "}
            <span style={{ color: pendingSuitInfo.color }}>
              {pendingSuitInfo.symbol} {pendingSuitInfo.key}
            </span>
            ?
          </p>
          <p className={styles.confirmBody}>
            Your team must take <strong>every trick</strong>. Missing one sets you for the full bid.
          </p>
          <div className={styles.confirmActions}>
            <button className={styles.confirmYes} onClick={confirmMoon}>
              Yes, shoot the moon
            </button>
            <button className={styles.confirmNo} onClick={() => setPendingSuit(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
