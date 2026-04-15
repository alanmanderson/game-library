import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface Props {
  winnerTeam: string;
  finalScores: Record<string, number>;
  myTeam: string;
  forfeitNote?: string | null;
  rematchRequested: boolean;
  pendingSeats: string[];
  seatPlayers: Record<string, string | null>;
  onRematch: () => void;
  onLeaveToLobby: () => void;
}

export function GameOverScreen({
  winnerTeam,
  finalScores,
  myTeam,
  forfeitNote,
  rematchRequested,
  pendingSeats,
  seatPlayers,
  onRematch,
  onLeaveToLobby,
}: Props) {
  const youWon = winnerTeam === myTeam;
  const otherTeam = winnerTeam === "NS" ? "EW" : "NS";

  const waitingNames = pendingSeats
    .map((s) => seatPlayers[s.toLowerCase()] ?? s)
    .join(", ");

  return (
    <View style={styles.container}>
      <Text style={styles.headline}>{youWon ? "Victory!" : "Game Over"}</Text>
      <Text style={styles.banner}>
        <Text style={styles.bold}>{winnerTeam}</Text> wins the game
      </Text>
      {forfeitNote && <Text style={styles.forfeit}>{forfeitNote}</Text>}

      <View style={styles.scores}>
        <View style={[styles.scoreCard, winnerTeam === "NS" && styles.winnerCard]}>
          <Text style={styles.teamLabel}>NS</Text>
          <Text style={styles.scoreValue}>{finalScores.NS}</Text>
        </View>
        <View style={[styles.scoreCard, winnerTeam === "EW" && styles.winnerCard]}>
          <Text style={styles.teamLabel}>EW</Text>
          <Text style={styles.scoreValue}>{finalScores.EW}</Text>
        </View>
      </View>

      <Text style={styles.finalLine}>
        Final: <Text style={styles.bold}>{winnerTeam} {finalScores[winnerTeam]}</Text>
        {" vs "}
        <Text style={styles.bold}>{otherTeam} {finalScores[otherTeam]}</Text>
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, rematchRequested ? styles.rematchDisabled : styles.rematchButton]}
          onPress={onRematch}
          disabled={rematchRequested}
        >
          <Text style={rematchRequested ? styles.rematchDisabledText : styles.buttonText}>
            {rematchRequested ? "Waiting for others…" : "Rematch"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.lobbyButton]} onPress={onLeaveToLobby}>
          <Text style={styles.buttonText}>Leave to Lobby</Text>
        </TouchableOpacity>
      </View>

      {rematchRequested && pendingSeats.length > 0 && (
        <Text style={styles.waiting}>Waiting on: {waitingNames}</Text>
      )}
      {rematchRequested && pendingSeats.length === 0 && (
        <Text style={styles.waiting}>Starting new game…</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.5)",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    maxWidth: 420,
  },
  headline: {
    fontSize: 26,
    fontWeight: "700",
    color: "#ffd700",
  },
  banner: {
    fontSize: 16,
    color: "#eee",
  },
  bold: {
    fontWeight: "700",
    color: "#fff",
  },
  forfeit: {
    color: "#ffb74d",
    fontSize: 14,
    textAlign: "center",
  },
  scores: {
    flexDirection: "row",
    gap: 16,
    marginVertical: 4,
  },
  scoreCard: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 2,
    borderColor: "transparent",
    minWidth: 80,
  },
  winnerCard: {
    borderColor: "#ffd700",
    backgroundColor: "rgba(255,215,0,0.12)",
  },
  teamLabel: {
    color: "#aaa",
    fontSize: 12,
    letterSpacing: 1,
  },
  scoreValue: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
  },
  finalLine: {
    color: "#ccc",
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
  },
  rematchButton: {
    backgroundColor: "#4a90d9",
  },
  rematchDisabled: {
    backgroundColor: "#444",
  },
  rematchDisabledText: {
    color: "#888",
    fontWeight: "600",
  },
  lobbyButton: {
    backgroundColor: "#2e7d32",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  waiting: {
    color: "#aaa",
    fontSize: 13,
    textAlign: "center",
  },
});
