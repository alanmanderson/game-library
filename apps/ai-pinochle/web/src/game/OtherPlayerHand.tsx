import styles from "./OtherPlayerHand.module.css";

interface Props {
  position: "top" | "left" | "right";
  cardCount: number;
}

export function OtherPlayerHand({ position, cardCount }: Props) {
  const isHorizontal = position === "top";
  const cards = Array.from({ length: cardCount }, (_, i) => (
    <img key={i} src="/img/back.svg" alt="card back" />
  ));

  return (
    <div className={isHorizontal ? styles.horizontalFan : styles.verticalFan}>
      {cards}
    </div>
  );
}
