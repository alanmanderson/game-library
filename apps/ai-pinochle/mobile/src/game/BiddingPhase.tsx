import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";

interface BiddingState {
  currentBid: number | null;
  highestBidderSeat: string | null;
  nextSeat: string;
  minBid: number;
}

interface Props {
  biddingState: BiddingState;
  mySeat: string;
  sendMessage: (msg: Record<string, unknown>) => void;
}

const SEAT_LABELS: Record<string, string> = {
  NORTH: "North",
  EAST: "East",
  SOUTH: "South",
  WEST: "West",
};

function seatLabel(seat: string): string {
  return SEAT_LABELS[seat] ?? seat;
}

export function BiddingPhase({ biddingState, mySeat, sendMessage }: Props) {
  const { currentBid, highestBidderSeat, nextSeat, minBid } = biddingState;
  const isMyTurn = nextSeat === mySeat;
  const [bidAmount, setBidAmount] = useState(String(minBid));

  useEffect(() => {
    setBidAmount(String(minBid));
  }, [minBid]);

  function handleBid() {
    const amount = parseInt(bidAmount, 10);
    if (isNaN(amount) || amount < minBid) return;
    sendMessage({ action: "SUBMIT_BID", payload: { amount } });
  }

  function handlePass() {
    sendMessage({ action: "SUBMIT_BID", payload: {} });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bidding</Text>

      <View style={styles.status}>
        {currentBid !== null ? (
          <Text style={styles.statusText}>
            Current bid: <Text style={styles.bold}>{currentBid}</Text> by{" "}
            <Text style={styles.bold}>{seatLabel(highestBidderSeat!)}</Text>
          </Text>
        ) : (
          <Text style={styles.statusText}>No bids yet</Text>
        )}
      </View>

      {isMyTurn ? (
        <View style={styles.controls}>
          <Text style={styles.turnLabel}>Your turn to bid</Text>
          <View style={styles.bidRow}>
            <TextInput
              style={styles.bidInput}
              keyboardType="number-pad"
              value={bidAmount}
              onChangeText={setBidAmount}
            />
            <TouchableOpacity style={styles.bidButton} onPress={handleBid}>
              <Text style={styles.bidButtonText}>Bid</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.passButton} onPress={handlePass}>
              <Text style={styles.passButtonText}>Pass</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={styles.waiting}>
          Waiting for <Text style={styles.bold}>{seatLabel(nextSeat)}</Text> to
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
  bidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bidInput: {
    borderWidth: 1,
    borderColor: "#666",
    borderRadius: 6,
    padding: 8,
    width: 60,
    textAlign: "center",
    color: "#fff",
    backgroundColor: "#2a4a2a",
    fontSize: 16,
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
