import React, { useState } from "react";
import { View, Text, TouchableOpacity, Switch, StyleSheet } from "react-native";

interface BiddingResult {
  winningSeat: string;
  winningBid: number;
}

interface Props {
  biddingResult: BiddingResult;
  isBidWinner: boolean;
  sendMessage: (msg: Record<string, unknown>) => void;
}

const SUITS = [
  { key: "HEARTS", symbol: "\u2665", color: "#d32f2f" },
  { key: "DIAMONDS", symbol: "\u2666", color: "#d32f2f" },
  { key: "CLUBS", symbol: "\u2663", color: "#333" },
  { key: "SPADES", symbol: "\u2660", color: "#333" },
];

const SEAT_LABELS: Record<string, string> = {
  NORTH: "North",
  EAST: "East",
  SOUTH: "South",
  WEST: "West",
};

export function TrumpPhase({
  biddingResult,
  isBidWinner,
  sendMessage,
}: Props) {
  const [shootTheMoon, setShootTheMoon] = useState(false);

  function handleSelect(suit: string) {
    sendMessage({
      action: "DECLARE_TRUMP",
      payload: { suit, shoot_the_moon: shootTheMoon },
    });
  }

  if (!isBidWinner) {
    const label =
      SEAT_LABELS[biddingResult.winningSeat] ?? biddingResult.winningSeat;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Naming Trump</Text>
        <Text style={styles.waiting}>
          Waiting for <Text style={styles.bold}>{label}</Text> to declare
          trump...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Trump Suit</Text>
      <Text style={styles.subtitle}>
        You won the bid with{" "}
        <Text style={styles.bold}>{biddingResult.winningBid}</Text>
      </Text>

      <View style={styles.suits}>
        {SUITS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={styles.suitButton}
            onPress={() => handleSelect(s.key)}
          >
            <Text style={[styles.suitSymbol, { color: s.color }]}>
              {s.symbol}
            </Text>
            <Text style={styles.suitName}>{s.key}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.moonRow}>
        <Switch
          value={shootTheMoon}
          onValueChange={setShootTheMoon}
          trackColor={{ false: "#555", true: "#4a90d9" }}
        />
        <Text style={styles.moonLabel}>Shoot the Moon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    padding: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#eee",
    marginBottom: 8,
  },
  subtitle: {
    color: "#ccc",
    fontSize: 14,
    marginBottom: 16,
  },
  bold: {
    fontWeight: "bold",
    color: "#fff",
  },
  waiting: {
    color: "#aaa",
    fontSize: 14,
    fontStyle: "italic",
  },
  suits: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: 16,
  },
  suitButton: {
    width: 80,
    height: 80,
    backgroundColor: "#fff",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  suitSymbol: {
    fontSize: 32,
    fontWeight: "bold",
  },
  suitName: {
    fontSize: 10,
    color: "#666",
    marginTop: 2,
  },
  moonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  moonLabel: {
    color: "#ccc",
    fontSize: 14,
  },
});
