import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { BiddingState } from "@pinochle/shared";
import { SEAT_LABELS } from "@pinochle/shared";

interface Props {
  biddingState: BiddingState;
  mySeat: string;
  sendMessage: (msg: Record<string, unknown>) => void;
}

function seatLabel(seat: string): string {
  return SEAT_LABELS[seat] ?? seat;
}

const MAX_BID = 1500;

export function BiddingPhase({ biddingState, mySeat, sendMessage }: Props) {
  const { current_highest_bid, highest_bidder_seat, next_to_act_seat, minimum_valid_bid } = biddingState;
  const isMyTurn = next_to_act_seat === mySeat;
  const [bidAmount, setBidAmount] = useState(minimum_valid_bid);

  useEffect(() => {
    setBidAmount((prev) => (prev < minimum_valid_bid ? minimum_valid_bid : prev));
  }, [minimum_valid_bid]);

  function clamp(n: number): number {
    if (n < minimum_valid_bid) return minimum_valid_bid;
    if (n > MAX_BID) return MAX_BID;
    return n;
  }

  function adjust(delta: number) {
    setBidAmount((prev) => clamp(prev + delta));
  }

  function handleBid() {
    sendMessage({ action: "SUBMIT_BID", payload: { amount: clamp(bidAmount) } });
  }

  function handlePass() {
    sendMessage({ action: "SUBMIT_BID", payload: {} });
  }

  const canDecrement = bidAmount - 1 >= minimum_valid_bid;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bidding</Text>

      <View style={styles.status}>
        {current_highest_bid !== null ? (
          <Text style={styles.statusText}>
            Current bid: <Text style={styles.bold}>{current_highest_bid}</Text> by{" "}
            <Text style={styles.bold}>{seatLabel(highest_bidder_seat!)}</Text>
          </Text>
        ) : (
          <Text style={styles.statusText}>No bids yet</Text>
        )}
      </View>

      {isMyTurn ? (
        <View style={styles.controls}>
          <Text style={styles.turnLabel}>Your turn to bid</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[styles.stepButton, !canDecrement && styles.stepButtonDisabled]}
              onPress={() => adjust(-1)}
              disabled={!canDecrement}
            >
              <Text style={styles.stepText}>−1</Text>
            </TouchableOpacity>
            <View style={styles.bidValue}>
              <Text style={styles.bidNumber}>{bidAmount}</Text>
              <Text style={styles.bidMin}>min {minimum_valid_bid}</Text>
            </View>
            <TouchableOpacity
              style={[styles.stepButton, bidAmount >= MAX_BID && styles.stepButtonDisabled]}
              onPress={() => adjust(1)}
              disabled={bidAmount >= MAX_BID}
            >
              <Text style={styles.stepText}>+1</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.stepButton, bidAmount >= MAX_BID && styles.stepButtonDisabled]}
              onPress={() => adjust(5)}
              disabled={bidAmount >= MAX_BID}
            >
              <Text style={styles.stepText}>+5</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bidRow}>
            <TouchableOpacity style={styles.bidButton} onPress={handleBid}>
              <Text style={styles.bidButtonText}>Bid {bidAmount}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.passButton} onPress={handlePass}>
              <Text style={styles.passButtonText}>Pass</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={styles.waiting}>
          Waiting for <Text style={styles.bold}>{seatLabel(next_to_act_seat)}</Text> to
          bid...
        </Text>
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
  status: {
    marginBottom: 12,
  },
  statusText: {
    color: "#ccc",
    fontSize: 14,
  },
  bold: {
    fontWeight: "bold",
    color: "#fff",
  },
  controls: {
    alignItems: "center",
  },
  turnLabel: {
    color: "#4caf50",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  stepButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#3a5a3a",
    borderRadius: 4,
    minWidth: 40,
    alignItems: "center",
  },
  stepButtonDisabled: {
    opacity: 0.4,
  },
  stepText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  bidValue: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: "#2a4a2a",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#4a6a4a",
    minWidth: 64,
  },
  bidNumber: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  bidMin: {
    color: "#999",
    fontSize: 9,
  },
  bidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bidButton: {
    backgroundColor: "#4a90d9",
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bidButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  passButton: {
    backgroundColor: "#666",
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  passButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  waiting: {
    color: "#aaa",
    fontSize: 14,
    fontStyle: "italic",
  },
});
