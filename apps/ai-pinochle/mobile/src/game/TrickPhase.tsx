import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { CardPlayed, TrickResult } from "@pinochle/shared";
import { SEAT_LABELS } from "@pinochle/shared";
import { CardImage } from "./CardImage";

interface Props {
  trickNumber: number;
  currentTrick: CardPlayed[];
  nextToActSeat: string | null;
  tricksTaken: Record<string, number>;
  trickScores: Record<string, number>;
  trickResult: TrickResult | null;
  mySeat: string;
}

function getPositionForSeat(
  seat: string,
  mySeat: string,
): "bottom" | "left" | "top" | "right" {
  const order = ["NORTH", "EAST", "SOUTH", "WEST"];
  const myIdx = order.indexOf(mySeat.toUpperCase());
  const seatIdx = order.indexOf(seat.toUpperCase());
  const offset = (seatIdx - myIdx + 4) % 4;
  return (["bottom", "left", "top", "right"] as const)[offset];
}

export function TrickPhase({
  trickNumber,
  currentTrick,
  nextToActSeat,
  tricksTaken,
  trickScores,
  trickResult,
  mySeat,
}: Props) {
  const positionCards: Record<string, CardPlayed | null> = {
    top: null,
    left: null,
    bottom: null,
    right: null,
  };
  for (const entry of currentTrick) {
    const pos = getPositionForSeat(entry.seat, mySeat);
    positionCards[pos] = entry;
  }

  const isMyTurn = nextToActSeat === mySeat;
  const winnerPosition = trickResult
    ? getPositionForSeat(trickResult.winnerSeat, mySeat)
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.trickNum}>Trick {trickNumber} / 12</Text>
        <View style={styles.scores}>
          <Text style={styles.scoreText}>
            NS: {trickScores.NS} pts ({tricksTaken.NS} tricks)
          </Text>
          <Text style={styles.scoreText}>
            EW: {trickScores.EW} pts ({tricksTaken.EW} tricks)
          </Text>
        </View>
      </View>

      <View style={styles.trickTable}>
        <View style={styles.topSlot}>
          <CardSlot
            entry={positionCards.top}
            isWinner={winnerPosition === "top"}
          />
        </View>
        <View style={styles.middleRow}>
          <View style={styles.leftSlot}>
            <CardSlot
              entry={positionCards.left}
              isWinner={winnerPosition === "left"}
            />
          </View>
          <View style={styles.centerSlot}>
            {trickResult && (
              <View style={styles.winnerBadge}>
                <Text style={styles.winnerText}>
                  {SEAT_LABELS[trickResult.winnerSeat]} wins!
                </Text>
                <Text style={styles.winnerPoints}>
                  +{trickResult.trickPoints}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.rightSlot}>
            <CardSlot
              entry={positionCards.right}
              isWinner={winnerPosition === "right"}
            />
          </View>
        </View>
        <View style={styles.bottomSlot}>
          <CardSlot
            entry={positionCards.bottom}
            isWinner={winnerPosition === "bottom"}
          />
        </View>
      </View>

      <View style={styles.turnIndicator}>
        {isMyTurn ? (
          <Text style={styles.yourTurn}>Your turn — select a card</Text>
        ) : nextToActSeat ? (
          <Text style={styles.waitingText}>
            Waiting for {SEAT_LABELS[nextToActSeat]}...
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function CardSlot({
  entry,
  isWinner,
}: {
  entry: CardPlayed | null;
  isWinner: boolean;
}) {
  if (!entry) {
    return <View style={styles.emptySlot} />;
  }

  return (
    <View style={isWinner ? styles.winnerCard : undefined}>
      <CardImage card={entry.card} width={50} height={70} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    padding: 8,
  },
  info: {
    alignItems: "center",
    marginBottom: 8,
  },
  trickNum: {
    color: "#eee",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  scores: {
    flexDirection: "row",
    gap: 16,
  },
  scoreText: {
    color: "#aaa",
    fontSize: 11,
  },
  trickTable: {
    alignItems: "center",
    width: 200,
    height: 200,
  },
  topSlot: {
    alignItems: "center",
    marginBottom: 4,
  },
  middleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  leftSlot: {
    width: 60,
    alignItems: "center",
  },
  centerSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  rightSlot: {
    width: 60,
    alignItems: "center",
  },
  bottomSlot: {
    alignItems: "center",
    marginTop: 4,
  },
  emptySlot: {
    width: 50,
    height: 70,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#555",
    borderStyle: "dashed",
  },
  winnerCard: {
    borderWidth: 2,
    borderColor: "#ffd700",
    borderRadius: 6,
    shadowColor: "#ffd700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  winnerBadge: {
    alignItems: "center",
  },
  winnerText: {
    color: "#ffd700",
    fontWeight: "bold",
    fontSize: 13,
  },
  winnerPoints: {
    color: "#ffd700",
    fontSize: 12,
  },
  turnIndicator: {
    marginTop: 8,
  },
  yourTurn: {
    color: "#4caf50",
    fontWeight: "600",
    fontSize: 14,
  },
  waitingText: {
    color: "#aaa",
    fontSize: 13,
    fontStyle: "italic",
  },
});
