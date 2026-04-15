import React, { useState } from "react";
import { View, Text, TouchableOpacity, Switch, StyleSheet } from "react-native";
import type { BiddingResult } from "@pinochle/shared";
import { SUITS, SEAT_LABELS, sendAction } from "@pinochle/shared";

interface Props {
  biddingResult: BiddingResult;
  isBidWinner: boolean;
  sendMessage: (msg: Record<string, unknown>) => void;
}

export function TrumpPhase({
  biddingResult,
  isBidWinner,
  sendMessage,
}: Props) {
  const [shootTheMoon, setShootTheMoon] = useState(false);
  const [pendingSuit, setPendingSuit] = useState<string | null>(null);

  function submit(suit: string, moon: boolean) {
    sendAction(sendMessage, {
      action: "DECLARE_TRUMP",
      payload: { suit, shoot_the_moon: moon },
    });
  }

  function handleSelect(suit: string) {
    if (shootTheMoon) {
      setPendingSuit(suit);
      return;
    }
    submit(suit, false);
  }

  function confirmMoon() {
    if (!pendingSuit) return;
    submit(pendingSuit, true);
    setPendingSuit(null);
  }

  const pendingSuitInfo = pendingSuit ? SUITS.find((s) => s.key === pendingSuit) : null;

  if (!isBidWinner) {
    const label =
      SEAT_LABELS[biddingResult.winning_seat] ?? biddingResult.winning_seat;
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
        <Text style={styles.bold}>{biddingResult.winning_bid}</Text>
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
      <Text style={styles.moonExplain}>
        Shooting the moon means your team pledges to take every trick this hand.
        If you succeed, you score a massive bonus; if you miss even one trick, you go set for the full bid.
      </Text>

      {pendingSuit && pendingSuitInfo && (
        <View style={styles.confirmBox}>
          <Text style={styles.confirmTitle}>
            Shoot the moon with{" "}
            <Text style={{ color: pendingSuitInfo.color }}>
              {pendingSuitInfo.symbol} {pendingSuitInfo.key}
            </Text>
            ?
          </Text>
          <Text style={styles.confirmBody}>
            Your team must take every trick. Missing one sets you for the full bid.
          </Text>
          <View style={styles.confirmActions}>
            <TouchableOpacity style={styles.confirmYes} onPress={confirmMoon}>
              <Text style={styles.confirmYesText}>Yes, shoot the moon</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmNo}
              onPress={() => setPendingSuit(null)}
            >
              <Text style={styles.confirmNoText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  moonExplain: {
    marginTop: 8,
    color: "#aaa",
    fontSize: 11,
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 15,
  },
  confirmBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#3a3020",
    borderWidth: 2,
    borderColor: "#ffb300",
    borderRadius: 8,
    alignItems: "center",
    gap: 6,
    maxWidth: 320,
  },
  confirmTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  confirmBody: {
    color: "#ccc",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 15,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  confirmYes: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#d32f2f",
    borderRadius: 4,
  },
  confirmYesText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
  },
  confirmNo: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#555",
    borderRadius: 4,
  },
  confirmNoText: {
    color: "#fff",
    fontSize: 12,
  },
});
