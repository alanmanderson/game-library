import React, { useEffect, useMemo, useRef } from "react";
import { View, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { cardSuit, sortHand, SUIT_LETTER } from "@pinochle/shared";
import { CardImage } from "./CardImage";
import { triggerHaptic } from "../haptics";

// Matches the web HandDisplay DEAL_STAGGER_MS so mobile cadence feels similar.
const DEAL_STAGGER_MS = 40;

interface Props {
  cards: string[];
  trumpSuit: string | null;
  onCardClick?: (card: string) => void;
  legalCards?: string[];
}

// Memoized: see web HandDisplay for the full reasoning. Caller must pass a
// stable `onCardClick` (useCallback) for the memo to short-circuit during
// trick play — see GameScreen.
export const HandDisplay = React.memo(function HandDisplay({
  cards,
  trumpSuit,
  onCardClick,
  legalCards,
}: Props) {
  const trumpLetter = trumpSuit ? SUIT_LETTER[trumpSuit] ?? null : null;
  const sorted = useMemo(() => sortHand(cards), [cards]);
  const interactive = !!(onCardClick && legalCards);

  // Fire a short haptic pulse for each newly-dealt card, staggered to mirror
  // the web audio cadence. Same multiset-diff logic as web HandDisplay —
  // Pinochle has duplicate cards, so a plain Set won't catch "one more 10S".
  const prevCountsRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const prev = prevCountsRef.current;
    const remaining = new Map(prev);
    let newCount = 0;

    for (const card of sorted) {
      const left = remaining.get(card) ?? 0;
      if (left > 0) {
        remaining.set(card, left - 1);
      } else {
        newCount += 1;
      }
    }

    for (let i = 0; i < newCount; i++) {
      const delay = i * DEAL_STAGGER_MS;
      if (delay === 0) {
        triggerHaptic("light");
      } else {
        setTimeout(() => triggerHaptic("light"), delay);
      }
    }

    const next = new Map<string, number>();
    for (const c of sorted) next.set(c, (next.get(c) ?? 0) + 1);
    prevCountsRef.current = next;
  }, [sorted]);

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
});

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
