import styles from "./TrickPhase.module.css";

interface CardPlayed {
  seat: string;
  card: string;
}

interface TrickResult {
  trickNumber: number;
  winnerSeat: string;
  trickPoints: number;
}

interface Props {
  trickNumber: number;
  currentTrick: CardPlayed[];
  nextToActSeat: string | null;
  tricksTaken: Record<string, number>;
  trickScores: Record<string, number>;
  trickResult: TrickResult | null;
  mySeat: string;
}

const SEAT_LABELS: Record<string, string> = {
  NORTH: "North",
  EAST: "East",
  SOUTH: "South",
  WEST: "West",
};

function cardToImage(code: string): string {
  return `/img/${code}.png`;
}

function getPositionForSeat(
  seat: string,
  mySeat: string,
): "bottom" | "left" | "top" | "right" {
  const order = ["NORTH", "EAST", "SOUTH", "WEST"];
  const myIdx = order.indexOf(mySeat.toUpperCase());
  const seatIdx = order.indexOf(seat.toUpperCase());
  const offset = (seatIdx - myIdx + 4) % 4;
  return (["bottom", "left", "top", "right"] as const)[offset];
}

export function TrickPhase({
  trickNumber,
  currentTrick,
  nextToActSeat,
  tricksTaken,
  trickScores,
  trickResult,
  mySeat,
}: Props) {
  const positionCards: Record<string, CardPlayed | null> = {
    top: null,
    left: null,
    bottom: null,
    right: null,
  };
  for (const entry of currentTrick) {
    const pos = getPositionForSeat(entry.seat, mySeat);
    positionCards[pos] = entry;
  }

  const isMyTurn = nextToActSeat === mySeat;
  const winnerPosition = trickResult
    ? getPositionForSeat(trickResult.winnerSeat, mySeat)
    : null;

  return (
    <div className={styles.container}>
      <div className={styles.info}>
        <span className={styles.trickNum}>Trick {trickNumber} / 12</span>
        <div className={styles.scores}>
          <span>NS: {trickScores.NS} pts ({tricksTaken.NS} tricks)</span>
          <span>EW: {trickScores.EW} pts ({tricksTaken.EW} tricks)</span>
        </div>
      </div>

      <div className={styles.trickTable}>
        <div className={styles.topSlot}>
          <CardSlot entry={positionCards.top} isWinner={winnerPosition === "top"} />
        </div>
        <div className={styles.leftSlot}>
          <CardSlot entry={positionCards.left} isWinner={winnerPosition === "left"} />
        </div>
        <div className={styles.centerSlot}>
          {trickResult && (
            <div className={styles.winnerBadge}>
              {SEAT_LABELS[trickResult.winnerSeat]} wins!
              <span className={styles.winnerPoints}>+{trickResult.trickPoints}</span>
            </div>
          )}
        </div>
        <div className={styles.rightSlot}>
          <CardSlot entry={positionCards.right} isWinner={winnerPosition === "right"} />
        </div>
        <div className={styles.bottomSlot}>
          <CardSlot entry={positionCards.bottom} isWinner={winnerPosition === "bottom"} />
        </div>
      </div>

      <div className={styles.turnIndicator}>
        {isMyTurn ? (
          <span className={styles.yourTurn}>Your turn &mdash; select a card</span>
        ) : nextToActSeat ? (
          <span className={styles.waiting}>
            Waiting for {SEAT_LABELS[nextToActSeat]}...
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CardSlot({ entry, isWinner }: { entry: CardPlayed | null; isWinner: boolean }) {
  if (!entry) {
    return <div className={styles.emptySlot} />;
  }

  return (
    <img
      src={cardToImage(entry.card)}
      alt={entry.card}
      className={`${styles.trickCard} ${isWinner ? styles.winner : ""}`}
    />
  );
}
