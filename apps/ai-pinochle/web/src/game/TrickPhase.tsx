import type { CardPlayed, TrickResult } from "@pinochle/shared";
import { SEAT_LABELS, SUITS, cardLabel } from "@pinochle/shared";
import { CardImage } from "./CardImage";
import styles from "./TrickPhase.module.css";

interface Props {
  trickNumber: number;
  currentTrick: CardPlayed[];
  nextToActSeat: string | null;
  tricksTaken: Record<string, number>;
  trickScores: Record<string, number>;
  trickResult: TrickResult | null;
  mySeat: string;
  trumpSuit: string | null;
  gameScores: Record<string, number>;
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
  trumpSuit,
  gameScores,
}: Props) {
  const trumpInfo = trumpSuit ? SUITS.find((s) => s.key === trumpSuit) : null;
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
    ? getPositionForSeat(trickResult.winner_seat, mySeat)
    : null;

  return (
    <div className={styles.container}>
      <div className={styles.info}>
        <div className={styles.infoTop}>
          <span className={styles.trickNum}>Trick {trickNumber} / 12</span>
          {trumpInfo && (
            <span
              className={styles.trumpBadge}
              aria-label={`Trump: ${trumpInfo.key}`}
            >
              <span className={styles.trumpLabel}>Trump</span>
              <span className={styles.trumpSymbol} style={{ color: trumpInfo.color }}>
                {trumpInfo.symbol}
              </span>
              <span className={styles.trumpName}>{trumpInfo.key}</span>
            </span>
          )}
        </div>
        <div className={styles.scores}>
          <span>
            NS: {trickScores.NS} pts ({tricksTaken.NS} tricks)
            {" \u2022 "}
            <span className={styles.gameScore}>Game {gameScores.NS}/150</span>
          </span>
          <span>
            EW: {trickScores.EW} pts ({tricksTaken.EW} tricks)
            {" \u2022 "}
            <span className={styles.gameScore}>Game {gameScores.EW}/150</span>
          </span>
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
              {SEAT_LABELS[trickResult.winner_seat]} wins!
              <span className={styles.winnerPoints}>+{trickResult.trick_points}</span>
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

      <div className={styles.turnIndicator} role="status" aria-live="polite">
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
    <CardImage
      card={entry.card}
      alt={cardLabel(entry.card)}
      width={60}
      height={84}
      className={`${styles.trickCard} ${isWinner ? styles.winner : ""}`}
    />
  );
}
