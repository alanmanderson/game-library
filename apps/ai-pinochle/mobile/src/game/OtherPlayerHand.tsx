import React from "react";
import { View, StyleSheet } from "react-native";
import { CardBack } from "./CardImage";

interface Props {
  position: "top" | "left" | "right";
  cardCount: number;
}

export function OtherPlayerHand({ position, cardCount }: Props) {
  const isHorizontal = position === "top";
  const cards = Array.from({ length: cardCount }, (_, i) => (
    <CardBack
      key={i}
      width={isHorizontal ? 28 : 30}
      height={isHorizontal ? 40 : 42}
      style={
        isHorizontal
          ? { marginLeft: i === 0 ? 0 : -12 }
          : { marginTop: i === 0 ? 0 : -28 }
      }
    />
  ));

  return (
    <View style={isHorizontal ? styles.horizontalFan : styles.verticalFan}>
      {cards}
    </View>
  );
}

const styles = StyleSheet.create({
  horizontalFan: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  verticalFan: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
});
