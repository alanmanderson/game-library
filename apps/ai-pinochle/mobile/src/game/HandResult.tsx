import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { HandResultData } from "@pinochle/shared";
import { SEAT_LABELS, SEAT_ORDER } from "@pinochle/shared";

interface Props {
  result: HandResultData;
  hasAcknowledged: boolean;
  acknowledgedSeats: string[];
  seatPlayers: Record<string, string | null>;
  onAcknowledge: () => void;
}

export function HandResult({
  result,
  hasAcknowledged,
  acknowledgedSeats,
  seatPlayers,
  onAcknowledge,
}: Props) {
  const { trick_scores, team_meld, bid, bidding_team, score_deltas, game_scores } =
    result;
  const otherTeam = bidding_team === "NS" ? "EW" : "NS";
  const bidMade = score_deltas[bidding_team] >= 0;

  const waitingOn = SEAT_ORDER
    .filter((seat) => !acknowledgedSeats.includes(seat))
    .map((seat) => seatPlayers[seat.toLowerCase()] ?? SEAT_LABELS[seat]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hand Complete</Text>

      <Text style={styles.bidInfo}>
        Bid: <Text style={styles.bold}>{bid}</Text> by{" "}
        <Text style={styles.bold}>{bidding_team}</Text>
        {" — "}
        <Text style={bidMade ? styles.made : styles.set}>
          {bidMade ? "Made!" : "Set!"}
        </Text>
      </Text>

      <View style={styles.table}>
        <View style={styles.headerRow}>
          <Text style={[styles.cell, styles.headerCell]}>Team</Text>
          <Text style={[styles.cell, styles.headerCell]}>Meld</Text>
          <Text style={[styles.cell, styles.headerCell]}>Tricks</Text>
          <Text style={[styles.cell, styles.headerCell]}>Delta</Text>
        </View>
        {[bidding_team, otherTeam].map((team) => (
          <View key={team} style={styles.row}>
            <Text style={[styles.cell, styles.teamCell]}>{team}</Text>
            <Text style={styles.cell}>{team_meld[team]}</Text>
            <Text style={styles.cell}>{trick_scores[team]}</Text>
            <Text
              style={[
                styles.cell,
                score_deltas[team] >= 0 ? styles.positive : styles.negative,
              ]}
            >
              {score_deltas[team] >= 0 ? "+" : ""}
              {score_deltas[team]}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.gameScore}>
        <Text style={styles.gameScoreLabel}>Game Score</Text>
        <View style={styles.gameScoreValues}>
          <Text style={styles.gameScoreText}>
            NS: <Text style={styles.bold}>{game_scores.NS}</Text>
          </Text>
          <Text style={styles.gameScoreText}>
            EW: <Text style={styles.bold}>{game_scores.EW}</Text>
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.okButton, hasAcknowledged && styles.okButtonDisabled]}
        onPress={onAcknowledge}
        disabled={hasAcknowledged}
      >
        <Text style={styles.okButtonText}>
          {hasAcknowledged ? "Waiting..." : "Continue"}
        </Text>
      </TouchableOpacity>
      <Text style={styles.ackProgress}>
        {acknowledgedSeats.length}/4 ready
        {hasAcknowledged && waitingOn.length > 0
          ? ` — waiting on ${waitingOn.join(", ")}`
          : ""}
      </Text>
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
  bidInfo: {
    color: "#ccc",
    fontSize: 14,
    marginBottom: 12,
  },
  bold: {
    fontWeight: "bold",
    color: "#fff",
  },
  made: {
    color: "#4caf50",
    fontWeight: "bold",
  },
  set: {
    color: "#f44336",
    fontWeight: "bold",
  },
  table: {
    width: "100%",
    maxWidth: 300,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#555",
    paddingBottom: 4,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
  },
  headerCell: {
    fontWeight: "bold",
    color: "#aaa",
  },
  cell: {
    flex: 1,
    textAlign: "center",
    color: "#ccc",
    fontSize: 14,
  },
  teamCell: {
    fontWeight: "600",
    color: "#eee",
  },
  positive: {
    color: "#4caf50",
    fontWeight: "bold",
  },
  negative: {
    color: "#f44336",
    fontWeight: "bold",
  },
  gameScore: {
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 12,
    width: "100%",
    maxWidth: 300,
  },
  gameScoreLabel: {
    color: "#aaa",
    fontSize: 13,
    marginBottom: 4,
  },
  gameScoreValues: {
    flexDirection: "row",
    gap: 24,
  },
  gameScoreText: {
    color: "#eee",
    fontSize: 16,
  },
  okButton: {
    backgroundColor: "#2e7d32",
    borderRadius: 6,
    paddingHorizontal: 32,
    paddingVertical: 10,
    marginBottom: 4,
  },
  okButtonDisabled: {
    opacity: 0.5,
  },
  okButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  ackProgress: {
    color: "#888",
    fontSize: 12,
  },
});
