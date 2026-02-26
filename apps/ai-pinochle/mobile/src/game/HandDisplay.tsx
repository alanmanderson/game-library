import React from "react";
import { View, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { CardImage } from "./CardImage";

interface Props {
  cards: string[];
  trumpSuit: string | null;
  onCardClick?: (card: string) => void;
  legalCards?: string[];
}

function cardSuit(code: string): string {
  return code.slice(-1);
}

function cardRank(code: string): string {
  return code.slice(0, -1);
}

const SUIT_ORDER: Record<string, number> = { C: 0, D: 1, H: 2, S: 3 };
const RANK_ORDER: Record<string, number> = {
  "9": 0,
  J: 1,
  Q: 2,
  K: 3,
  "10": 4,
  A: 5,
};

function sortHand(cards: string[]): string[] {
  return [...cards].sort((a, b) => {
    const suitDiff =
      (SUIT_ORDER[cardSuit(a)] ?? 0) - (SUIT_ORDER[cardSuit(b)] ?? 0);
    if (suitDiff !== 0) return suitDiff;
    return (RANK_ORDER[cardRank(a)] ?? 0) - (RANK_ORDER[cardRank(b)] ?? 0);
  });
}

const SUIT_LETTER: Record<string, string> = {
  HEARTS: "H",
  DIAMONDS: "D",
  CLUBS: "C",
  SPADES: "S",
};

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
