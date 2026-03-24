import { useState, useEffect } from "react";
import type { BiddingState } from "@pinochle/shared";
import { SEAT_LABELS } from "@pinochle/shared";
import styles from "./BiddingPhase.module.css";

interface Props {
  biddingState: BiddingState;
  mySeat: string;
  sendMessage: (msg: Record<string, unknown>) => void;
}

function seatLabel(seat: string): string {
  return SEAT_LABELS[seat] ?? seat;
}

export function BiddingPhase({ biddingState, mySeat, sendMessage }: Props) {
  const { current_highest_bid, highest_bidder_seat, next_to_act_seat, minimum_valid_bid } = biddingState;
  const isMyTurn = next_to_act_seat === mySeat;
  const [bidAmount, setBidAmount] = useState(minimum_valid_bid);

  useEffect(() => {
    setBidAmount(minimum_valid_bid);
  }, [minimum_valid_bid]);

  function handleBid() {
    sendMessage({ action: "SUBMIT_BID", payload: { amount: bidAmount } });
  }

  function handlePass() {
    sendMessage({ action: "SUBMIT_BID", payload: {} });
  }

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
          <div className={styles.bidRow}>
            <input
              type="number"
              className={styles.bidInput}
              min={minimum_valid_bid}
              value={bidAmount}
              onChange={(e) => setBidAmount(Number(e.target.value))}
            />
            <button className={styles.bidButton} onClick={handleBid}>
              Bid
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
