import React from "react";
import { View, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { cardSuit, sortHand, SUIT_LETTER } from "@pinochle/shared";
import { CardImage } from "./CardImage";

interface Props {
  cards: string[];
  trumpSuit: string | null;
  onCardClick?: (card: string) => void;
  legalCards?: string[];
}

export function HandDisplay({
  cards,
  trumpSuit,
  onCardClick,
  legalCards,
}: Props) {
  const trumpLetter = trumpSuit ? SUIT_LETTER[trumpSuit] ?? null : null;
  const sorted = sortHand(cards);
  const interactive = !!(onCardClick && legalCards);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.hand}
    >
      {sorted.map((card, i) => {
        const isTrump = trumpLetter && cardSuit(card) === trumpLetter;
        const isLegal = !legalCards || legalCards.includes(card);
        const clickable = interactive && isLegal;

        const cardStyle = [
          styles.cardWrapper,
          i > 0 && styles.overlap,
          interactive
            ? isLegal
              ? styles.legal
              : styles.disabled
            : isTrump
              ? styles.trump
              : null,
        ];

        if (clickable) {
          return (
            <TouchableOpacity
              key={`${card}-${i}`}
              style={cardStyle}
              onPress={() => onCardClick!(card)}
              activeOpacity={0.7}
            >
              <CardImage card={card} width={56} height={78} />
            </TouchableOpacity>
          );
        }

        return (
          <View key={`${card}-${i}`} style={cardStyle}>
            <CardImage card={card} width={56} height={78} />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hand: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  cardWrapper: {
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "transparent",
  },
  overlap: {
    marginLeft: -16,
  },
  trump: {
    borderColor: "#ffd700",
    shadowColor: "#ffd700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  legal: {
    borderColor: "#4caf50",
    shadowColor: "#4caf50",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  disabled: {
    opacity: 0.4,
  },
});
