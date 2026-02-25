import { useState } from "react";
import styles from "./PassCardsPhase.module.css";

interface Props {
  hand: string[];
  mySeat: string;
  biddingTeam: string;
  submittedSeats: string[];
  hasSubmitted: boolean;
  sendMessage: (msg: Record<string, unknown>) => void;
}

const TEAM_FOR_SEAT: Record<string, string> = {
  NORTH: "NS",
  SOUTH: "NS",
  EAST: "EW",
  WEST: "EW",
};

function cardToImage(code: string): string {
  return `/img/${code.toLowerCase()}.png`;
}

export function PassCardsPhase({
  hand,
  mySeat,
  biddingTeam,
  submittedSeats,
  hasSubmitted,
  sendMessage,
}: Props) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const isOnBiddingTeam = TEAM_FOR_SEAT[mySeat] === biddingTeam;

  if (!isOnBiddingTeam) {
    const teamLabel = biddingTeam === "NS" ? "North/South" : "East/West";
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Card Passing</h3>
        <p className={styles.waiting}>Waiting for {teamLabel} to pass cards...</p>
        <p className={styles.progress}>{submittedSeats.length}/2 submitted</p>
      </div>
    );
  }

  if (hasSubmitted) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Card Passing</h3>
        <p className={styles.waiting}>Waiting for partner...</p>
        <p className={styles.progress}>{submittedSeats.length}/2 submitted</p>
      </div>
    );
  }

  function toggleCard(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < 3) {
        next.add(index);
      }
      return next;
    });
  }

  function handleSubmit() {
    const cards = Array.from(selectedIndices).map((i) => hand[i]);
    sendMessage({ action: "PASS_CARDS", payload: { cards } });
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Pass 3 Cards to Partner</h3>
      <p className={styles.subtitle}>Select 3 cards to pass</p>

      <div className={styles.cardGrid}>
        {hand.map((card, i) => {
          const isSelected = selectedIndices.has(i);
          const classes = [styles.card, isSelected ? styles.selected : ""]
            .filter(Boolean)
            .join(" ");
          return (
            <img
              key={`${card}-${i}`}
              src={cardToImage(card)}
              alt={card}
              className={classes}
              onClick={() => toggleCard(i)}
            />
          );
        })}
      </div>

      <p className={styles.counter}>{selectedIndices.size}/3 selected</p>

      <button
        className={styles.submitButton}
        disabled={selectedIndices.size !== 3}
        onClick={handleSubmit}
      >
        Pass Cards
      </button>
    </div>
  );
}
