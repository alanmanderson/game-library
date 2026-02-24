import { useState } from "react";
import styles from "./BiddingPhase.module.css";

interface BiddingState {
  currentBid: number | null;
  highestBidderSeat: string | null;
  nextSeat: string;
  minBid: number;
}

interface Props {
  biddingState: BiddingState;
  mySeat: string;
  sendMessage: (msg: Record<string, unknown>) => void;
}

const SEAT_LABELS: Record<string, string> = {
  NORTH: "North",
  EAST: "East",
  SOUTH: "South",
  WEST: "West",
};

function seatLabel(seat: string): string {
  return SEAT_LABELS[seat] ?? seat;
}

export function BiddingPhase({ biddingState, mySeat, sendMessage }: Props) {
  const { currentBid, highestBidderSeat, nextSeat, minBid } = biddingState;
  const isMyTurn = nextSeat === mySeat;
  const [bidAmount, setBidAmount] = useState(minBid);

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
        {currentBid !== null ? (
          <p>
            Current bid: <strong>{currentBid}</strong> by{" "}
            <strong>{seatLabel(highestBidderSeat!)}</strong>
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
              min={minBid}
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
          Waiting for <strong>{seatLabel(nextSeat)}</strong> to bid...
        </p>
      )}
    </div>
  );
}
