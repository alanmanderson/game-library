import { useState, useEffect, useRef } from "react";
import type { BiddingState } from "@pinochle/shared";
import { SEAT_LABELS, sendAction } from "@pinochle/shared";
import { useHint } from "../hooks/useHint.ts";
import { playSound } from "../audio/sounds";
import styles from "./BiddingPhase.module.css";

interface Props {
  biddingState: BiddingState;
  mySeat: string;
  sendMessage: (msg: Record<string, unknown>) => void;
  hintsEnabled: boolean;
  roomCode: string;
}

function seatLabel(seat: string): string {
  return SEAT_LABELS[seat] ?? seat;
}

const MAX_BID = 1500;

export function BiddingPhase({ biddingState, mySeat, sendMessage, hintsEnabled, roomCode }: Props) {
  const { current_highest_bid, highest_bidder_seat, next_to_act_seat, minimum_valid_bid } = biddingState;
  const isMyTurn = next_to_act_seat === mySeat;
  const [bidAmount, setBidAmount] = useState(minimum_valid_bid);

  const { hint, fetchHint, clearHint } = useHint(roomCode, hintsEnabled);

  // Auto-fetch hint when it becomes our turn
  useEffect(() => {
    if (isMyTurn && hintsEnabled) {
      clearHint();
      fetchHint();
    }
  }, [isMyTurn, hintsEnabled, fetchHint, clearHint]);

  // Only reset when the new minimum invalidates the user's typed bid. If they
  // already typed a value at or above the new minimum, preserve it (slow
  // connections were clobbering in-progress bids).
  useEffect(() => {
    setBidAmount((prev) => (prev < minimum_valid_bid ? minimum_valid_bid : prev));
  }, [minimum_valid_bid]);

  // Audio cue whenever the highest-bid value changes — i.e. any player (us
  // included) placed a new winning bid. `null -> number` on first bid and
  // `number -> number` on subsequent raises both trigger. A pass doesn't
  // change the value, so no chime there (matches user intuition: chime =
  // "someone actually bid").
  const prevHighestRef = useRef<number | null>(current_highest_bid);
  useEffect(() => {
    if (
      current_highest_bid !== null &&
      current_highest_bid !== prevHighestRef.current
    ) {
      playSound("bid_chime", { gain: 0.5 });
    }
    prevHighestRef.current = current_highest_bid;
  }, [current_highest_bid]);

  function clamp(n: number): number {
    if (n < minimum_valid_bid) return minimum_valid_bid;
    if (n > MAX_BID) return MAX_BID;
    return n;
  }

  function adjust(delta: number) {
    setBidAmount((prev) => clamp(prev + delta));
  }

  function handleBid() {
    const amount = clamp(Math.trunc(bidAmount));
    sendAction(sendMessage, { action: "SUBMIT_BID", payload: { amount } });
  }

  function handlePass() {
    sendAction(sendMessage, { action: "SUBMIT_BID", payload: {} });
  }

  const canDecrement = bidAmount - 1 >= minimum_valid_bid;

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Bidding</h2>

      <div className={styles.status}>
        {current_highest_bid !== null ? (
          <p>
            Current bid: <strong>{current_highest_bid}</strong> by{" "}
            <strong>{seatLabel(highest_bidder_seat!)}</strong>
          </p>
        ) : (
          <p>No bids yet</p>
        )}
      </div>

      {isMyTurn ? (
        <div className={styles.controls}>
          <p className={styles.turnLabel}>Your turn to bid</p>
          {hint && (
            <div className={styles.hintBanner}>
              <span className={styles.hintLabel}>Hint:</span>
              <span>{hint.suggestion.reason as string}</span>
            </div>
          )}
          <div className={styles.stepperRow} role="group" aria-label="Bid amount">
            <button
              type="button"
              className={styles.stepperButton}
              onClick={() => adjust(-1)}
              disabled={!canDecrement}
              aria-label="Decrease bid by 1"
            >
              &minus;1
            </button>
            <div className={styles.bidValue} aria-live="polite">
              <span className={styles.bidNumber}>{bidAmount}</span>
              <span className={styles.bidMin}>min {minimum_valid_bid}</span>
            </div>
            <button
              type="button"
              className={styles.stepperButton}
              onClick={() => adjust(1)}
              disabled={bidAmount >= MAX_BID}
              aria-label="Increase bid by 1"
            >
              +1
            </button>
            <button
              type="button"
              className={styles.stepperButton}
              onClick={() => adjust(5)}
              disabled={bidAmount >= MAX_BID}
              aria-label="Increase bid by 5"
            >
              +5
            </button>
          </div>
          <div className={styles.bidRow}>
            <button className={styles.bidButton} onClick={handleBid}>
              Bid {bidAmount}
            </button>
            <button className={styles.passButton} onClick={handlePass}>
              Pass
            </button>
          </div>
        </div>
      ) : (
        <p className={styles.waiting}>
          Waiting for <strong>{seatLabel(next_to_act_seat)}</strong> to bid...
        </p>
      )}
    </div>
  );
}
