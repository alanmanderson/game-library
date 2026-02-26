import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { HandResultData } from "@pinochle/shared";

interface Props {
  result: HandResultData;
  hasAcknowledged: boolean;
  acknowledgedSeats: string[];
  onAcknowledge: () => void;
}

export function HandResult({
  result,
  hasAcknowledged,
  acknowledgedSeats,
  onAcknowledge,
}: Props) {
  const { trickScores, teamMeld, bid, biddingTeam, scoreDeltas, gameScores } =
    result;
  const otherTeam = biddingTeam === "NS" ? "EW" : "NS";
  const bidMade = scoreDeltas[biddingTeam] >= 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hand Complete</Text>

      <Text style={styles.bidInfo}>
        Bid: <Text style={styles.bold}>{bid}</Text> by{" "}
        <Text style={styles.bold}>{biddingTeam}</Text>
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
        {[biddingTeam, otherTeam].map((team) => (
          <View key={team} style={styles.row}>
            <Text style={[styles.cell, styles.teamCell]}>{team}</Text>
            <Text style={styles.cell}>{teamMeld[team]}</Text>
            <Text style={styles.cell}>{trickScores[team]}</Text>
            <Text
              style={[
                styles.cell,
                scoreDeltas[team] >= 0 ? styles.positive : styles.negative,
              ]}
            >
              {scoreDeltas[team] >= 0 ? "+" : ""}
              {scoreDeltas[team]}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.gameScore}>
        <Text style={styles.gameScoreLabel}>Game Score</Text>
        <View style={styles.gameScoreValues}>
          <Text style={styles.gameScoreText}>
            NS: <Text style={styles.bold}>{gameScores.NS}</Text>
          </Text>
          <Text style={styles.gameScoreText}>
            EW: <Text style={styles.bold}>{gameScores.EW}</Text>
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.okButton, hasAcknowledged && styles.okButtonDisabled]}
        onPress={onAcknowledge}
        disabled={hasAcknowledged}
      >
        <Text style={styles.okButtonText}>
          {hasAcknowledged ? "Waiting..." : "OK"}
        </Text>
      </TouchableOpacity>
      <Text style={styles.ackProgress}>
        {acknowledgedSeats.length}/4 ready
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
