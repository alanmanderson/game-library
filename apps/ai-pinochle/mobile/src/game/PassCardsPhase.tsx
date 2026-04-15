import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { TEAM_FOR_SEAT, sendAction } from "@pinochle/shared";
import { CardImage } from "./CardImage";

interface Props {
  hand: string[];
  mySeat: string;
  biddingTeam: string;
  submittedSeats: string[];
  hasSubmitted: boolean;
  sendMessage: (msg: Record<string, unknown>) => void;
}

export function PassCardsPhase({
  hand,
  mySeat,
  biddingTeam,
  submittedSeats,
  hasSubmitted,
  sendMessage,
}: Props) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(),
  );

  const isOnBiddingTeam = TEAM_FOR_SEAT[mySeat] === biddingTeam;

  if (!isOnBiddingTeam) {
    const teamLabel = biddingTeam === "NS" ? "North/South" : "East/West";
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Card Passing</Text>
        <Text style={styles.waiting}>
          Waiting for {teamLabel} to pass cards...
        </Text>
        <Text style={styles.progress}>
          {submittedSeats.length}/2 submitted
        </Text>
      </View>
    );
  }

  if (hasSubmitted) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Card Passing</Text>
        <Text style={styles.waiting}>Waiting for partner...</Text>
        <Text style={styles.progress}>
          {submittedSeats.length}/2 submitted
        </Text>
      </View>
    );
  }

  function toggleCard(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < 3) {
        next.add(index);
      }
      return next;
    });
  }

  function handleSubmit() {
    const cards = Array.from(selectedIndices).map((i) => hand[i]);
    sendAction(sendMessage, { action: "PASS_CARDS", payload: { cards } });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pass 3 Cards to Partner</Text>
      <Text style={styles.subtitle}>Select 3 cards to pass</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardGrid}
      >
        {hand.map((card, i) => {
          const isSelected = selectedIndices.has(i);
          return (
            <TouchableOpacity
              key={`${card}-${i}`}
              style={[styles.card, isSelected && styles.selected]}
              onPress={() => toggleCard(i)}
            >
              <CardImage card={card} width={56} height={78} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.counter}>{selectedIndices.size}/3 selected</Text>

      <TouchableOpacity
        style={[
          styles.submitButton,
          selectedIndices.size !== 3 && styles.submitDisabled,
        ]}
        disabled={selectedIndices.size !== 3}
        onPress={handleSubmit}
      >
        <Text style={styles.submitText}>Pass Cards</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    padding: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#eee",
    marginBottom: 4,
  },
  subtitle: {
    color: "#ccc",
    fontSize: 13,
    marginBottom: 12,
  },
  waiting: {
    color: "#aaa",
    fontSize: 14,
    fontStyle: "italic",
    marginBottom: 4,
  },
  progress: {
    color: "#888",
    fontSize: 12,
  },
  cardGrid: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selected: {
    borderColor: "#4caf50",
    shadowColor: "#4caf50",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  counter: {
    color: "#ccc",
    fontSize: 13,
    marginTop: 8,
    marginBottom: 8,
  },
  submitButton: {
    backgroundColor: "#2e7d32",
    borderRadius: 6,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
