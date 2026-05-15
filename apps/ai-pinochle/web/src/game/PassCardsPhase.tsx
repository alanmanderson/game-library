import { useState, useEffect } from "react";
import { TEAM_FOR_SEAT, cardLabel, sendAction } from "@pinochle/shared";
import { useHint } from "../hooks/useHint.ts";
import { CardImage } from "./CardImage";
import styles from "./PassCardsPhase.module.css";

interface Props {
  hand: string[];
  mySeat: string;
  biddingTeam: string;
  submittedSeats: string[];
  hasSubmitted: boolean;
  sendMessage: (msg: Record<string, unknown>) => void;
  hintsEnabled: boolean;
  roomCode: string;
}

export function PassCardsPhase({
  hand,
  mySeat,
  biddingTeam,
  submittedSeats,
  hasSubmitted,
  sendMessage,
  hintsEnabled,
  roomCode,
}: Props) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  const isOnBiddingTeam = TEAM_FOR_SEAT[mySeat] === biddingTeam;
  const needsToPass = isOnBiddingTeam && !hasSubmitted;

  const { hint, fetchHint } = useHint(roomCode, hintsEnabled);

  // Auto-fetch hint when the player needs to pass cards
  useEffect(() => {
    if (needsToPass && hintsEnabled) {
      fetchHint();
    }
  }, [needsToPass, hintsEnabled, fetchHint]);

  const suggestedCards: string[] =
    hint?.suggestion?.cards ? (hint.suggestion.cards as string[]) : [];

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
    sendAction(sendMessage, { action: "PASS_CARDS", payload: { cards } });
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Pass 3 Cards to Partner</h3>
      <p className={styles.subtitle}>Select 3 cards to pass</p>

      {hint && (
        <div className={styles.hintBanner}>
          <span className={styles.hintLabel}>Hint:</span>
          <span>{hint.suggestion.reason as string}</span>
        </div>
      )}

      <div className={styles.cardGrid}>
        {hand.map((card, i) => {
          const isSelected = selectedIndices.has(i);
          const isSuggested = suggestedCards.includes(card);
          const classes = [
            styles.card,
            isSelected ? styles.selected : "",
            isSuggested ? styles.suggested : "",
          ].filter(Boolean).join(" ");
          return (
            <CardImage
              key={`${card}-${i}`}
              card={card}
              alt={cardLabel(card)}
              className={classes}
              onClick={() => toggleCard(i)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCard(i); } }}
              tabIndex={0}
              role="checkbox"
              aria-checked={isSelected}
              aria-label={`${cardLabel(card)}${isSelected ? ", selected" : ""}`}
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
