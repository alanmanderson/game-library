import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import type { MeldData, Meld } from "@pinochle/shared";
import { SEAT_LABELS, SUIT_SYMBOLS, SEAT_ORDER } from "@pinochle/shared";

interface Props {
  meldData: MeldData;
  acknowledgedSeats: string[];
  hasAcknowledged: boolean;
  sendMessage: (msg: Record<string, unknown>) => void;
}

const SUIT_LETTER_TO_SYMBOL: Record<string, string> = {
  H: "\u2665",
  D: "\u2666",
  C: "\u2663",
  S: "\u2660",
};

function formatMeld(m: Meld): string {
  const suits = new Set(m.cards.map((c) => c.slice(-1)));
  if (suits.size === 1) {
    const symbol = SUIT_LETTER_TO_SYMBOL[[...suits][0]] ?? "";
    return `${m.name} (${symbol}): ${m.points}`;
  }
  return `${m.name}: ${m.points}`;
}

export function MeldPhase({
  meldData,
  acknowledgedSeats,
  hasAcknowledged,
  sendMessage,
}: Props) {
  function handleAcknowledge() {
    sendMessage({ action: "ACKNOWLEDGE_MELD", payload: {} });
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Meld</Text>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          Trump:{" "}
          <Text style={styles.bold}>
            {SUIT_SYMBOLS[meldData.trumpSuit]} {meldData.trumpSuit}
          </Text>
        </Text>
        <Text style={styles.summaryText}>
          Winning bid:{" "}
          <Text style={styles.bold}>{meldData.winningBid}</Text> (
          {meldData.biddingTeam})
        </Text>
        <Text style={styles.summaryText}>
          Team meld — NS:{" "}
          <Text style={styles.bold}>{meldData.teamMeld.NS}</Text>, EW:{" "}
          <Text style={styles.bold}>{meldData.teamMeld.EW}</Text>
        </Text>
      </View>

      <View style={styles.playersGrid}>
        {SEAT_ORDER.map((seat) => {
          const pm = meldData.playerMelds[seat];
          if (!pm) return null;
          const acked = acknowledgedSeats.includes(seat);

          return (
            <View key={seat} style={styles.playerCard}>
              <View style={styles.playerHeader}>
                <Text style={styles.playerName}>
                  {SEAT_LABELS[seat]}
                  {acked ? " \u2713" : ""}
                </Text>
                <Text style={styles.playerTotal}>{pm.total} pts</Text>
              </View>
              {pm.melds.length === 0 ? (
                <Text style={styles.noMelds}>No melds</Text>
              ) : (
                pm.melds.map((m, i) => (
                  <Text key={i} style={styles.meldText}>
                    {formatMeld(m)}
                  </Text>
                ))
              )}
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.ackButton, hasAcknowledged && styles.ackButtonDisabled]}
        onPress={handleAcknowledge}
        disabled={hasAcknowledged}
      >
        <Text style={styles.ackButtonText}>
          {hasAcknowledged ? "Acknowledged" : "Acknowledge"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    padding: 8,
    paddingBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#eee",
    marginBottom: 8,
  },
  summary: {
    marginBottom: 12,
    alignItems: "center",
  },
  summaryText: {
    color: "#ccc",
    fontSize: 13,
    marginBottom: 2,
  },
  bold: {
    fontWeight: "bold",
    color: "#fff",
  },
  playersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  playerCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 8,
    width: 160,
  },
  playerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  playerName: {
    color: "#eee",
    fontWeight: "600",
    fontSize: 13,
  },
  playerTotal: {
    color: "#ffd700",
    fontWeight: "600",
    fontSize: 13,
  },
  noMelds: {
    color: "#888",
    fontSize: 12,
    fontStyle: "italic",
  },
  meldText: {
    color: "#ccc",
    fontSize: 12,
    marginTop: 2,
  },
  ackButton: {
    backgroundColor: "#2e7d32",
    borderRadius: 6,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  ackButtonDisabled: {
    opacity: 0.5,
  },
  ackButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
