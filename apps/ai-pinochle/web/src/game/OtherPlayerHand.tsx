import { memo } from "react";
import styles from "./OtherPlayerHand.module.css";

interface Props {
  position: "top" | "left" | "right";
  cardCount: number;
  seatLabel?: string;
}

const POSITION_LABELS: Record<Props["position"], string> = {
  top: "Partner",
  left: "Left opponent",
  right: "Right opponent",
};

// All three props are primitives, so default shallow comparison is enough:
// re-renders only when this seat's card count actually changes (i.e. a trick
// completes), not on every bid/meld/turn-tick event.
export const OtherPlayerHand = memo(function OtherPlayerHand({
  position,
  cardCount,
  seatLabel,
}: Props) {
  const isHorizontal = position === "top";
  const cards = Array.from({ length: cardCount }, (_, i) => (
    <img key={i} src="/img/back.svg" alt="" aria-hidden="true" />
  ));
  const who = seatLabel ?? POSITION_LABELS[position];

  return (
    <div
      className={isHorizontal ? styles.horizontalFan : styles.verticalFan}
      aria-label={`${who} has ${cardCount} ${cardCount === 1 ? "card" : "cards"}`}
    >
      {cards}
    </div>
  );
});
