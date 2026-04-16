import { useLayoutEffect, useRef } from "react";
import type { CardPlayed, TrickResult } from "@pinochle/shared";
import { SEAT_LABELS, SUITS, cardLabel } from "@pinochle/shared";
import { CardImage } from "./CardImage";
import { flyFromSeatToSlot, sweepToWinner } from "./animations";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { playSound } from "../audio/sounds";
import styles from "./TrickPhase.module.css";

type Position = "bottom" | "left" | "top" | "right";

interface HintResult {
  phase: string;
  suggestion: Record<string, unknown>;
}

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
  hintsEnabled: boolean;
  hint: HintResult | null;
  hintLoading: boolean;
  onRequestHint: () => void;
}

function getPositionForSeat(seat: string, mySeat: string): Position {
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
  hintsEnabled,
  hint,
  hintLoading,
  onRequestHint,
}: Props) {
  const trumpInfo = trumpSuit ? SUITS.find((s) => s.key === trumpSuit) : null;
  const positionCards: Record<Position, CardPlayed | null> = {
    top: null,
    left: null,
    bottom: null,
    right: null,
  };
  for (const entry of currentTrick) {
    positionCards[getPositionForSeat(entry.seat, mySeat)] = entry;
  }

  const isMyTurn = nextToActSeat === mySeat;
  const winnerPosition = trickResult
    ? getPositionForSeat(trickResult.winner_seat, mySeat)
    : null;

  const reduced = useReducedMotion();
  const slotRefs = useRef<Record<Position, HTMLElement | null>>({
    top: null, left: null, bottom: null, right: null,
  });
  const prevCardsRef = useRef<Record<Position, string | null>>({
    top: null, left: null, bottom: null, right: null,
  });
  const prevWinnerRef = useRef<Position | null>(null);

  // Play-flight: when a new card appears in a slot, slide it in from that
  // seat's fan origin. Trick sweep: when the winner is announced, fly all
  // four cards off toward the winning side.
  useLayoutEffect(() => {
    let playedSlapThisPass = false;
    (Object.keys(slotRefs.current) as Position[]).forEach((pos) => {
      const nowCard = positionCards[pos]?.card ?? null;
      const wasCard = prevCardsRef.current[pos];
      if (nowCard && nowCard !== wasCard) {
        const el = slotRefs.current[pos];
        if (el) flyFromSeatToSlot(el, pos, reduced);
        // Guard against a future batch that introduces more than one new card
        // in a single render — we still want exactly one slap cue per play.
        if (!playedSlapThisPass) {
          playSound("card_slap", { gain: 0.7 });
          playedSlapThisPass = true;
        }
      }
      prevCardsRef.current[pos] = nowCard;
    });

    if (winnerPosition && prevWinnerRef.current !== winnerPosition) {
      (Object.keys(slotRefs.current) as Position[]).forEach((pos) => {
        const el = slotRefs.current[pos];
        if (el && positionCards[pos]) sweepToWinner(el, winnerPosition, reduced);
      });
      playSound("trick_sweep", { gain: 0.6 });
    }
    prevWinnerRef.current = winnerPosition;
  });

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
          <CardSlot
            entry={positionCards.top}
            isWinner={winnerPosition === "top"}
            imgRef={(el) => { slotRefs.current.top = el; }}
          />
        </div>
        <div className={styles.leftSlot}>
          <CardSlot
            entry={positionCards.left}
            isWinner={winnerPosition === "left"}
            imgRef={(el) => { slotRefs.current.left = el; }}
          />
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
          <CardSlot
            entry={positionCards.right}
            isWinner={winnerPosition === "right"}
            imgRef={(el) => { slotRefs.current.right = el; }}
          />
        </div>
        <div className={styles.bottomSlot}>
          <CardSlot
            entry={positionCards.bottom}
            isWinner={winnerPosition === "bottom"}
            imgRef={(el) => { slotRefs.current.bottom = el; }}
          />
        </div>
      </div>

      {hintsEnabled && isMyTurn && hint && (
        <div className={styles.hintBanner}>
          <span className={styles.hintLabel}>Hint:</span>
          <span>{hint.suggestion.reason as string}</span>
        </div>
      )}

      <div className={styles.turnIndicator} role="status" aria-live="polite">
        {isMyTurn ? (
          <span className={styles.yourTurn}>Your turn &mdash; select a card</span>
        ) : nextToActSeat ? (
          <span className={styles.waiting}>
            Waiting for {SEAT_LABELS[nextToActSeat]}...
          </span>
        ) : null}
        {hintsEnabled && isMyTurn && !hint && (
          <button
            className={styles.hintButton}
            onClick={onRequestHint}
            disabled={hintLoading}
          >
            {hintLoading ? "Loading..." : "Show hint"}
          </button>
        )}
      </div>
    </div>
  );
}

interface CardSlotProps {
  entry: CardPlayed | null;
  isWinner: boolean;
  imgRef: (el: HTMLImageElement | null) => void;
}

function CardSlot({ entry, isWinner, imgRef }: CardSlotProps) {
  if (!entry) {
    return <div className={styles.emptySlot} />;
  }

  return (
    <CardImage
      ref={imgRef}
      card={entry.card}
      alt={cardLabel(entry.card)}
      width={60}
      height={84}
      className={`${styles.trickCard} ${isWinner ? styles.winner : ""}`}
    />
  );
}
