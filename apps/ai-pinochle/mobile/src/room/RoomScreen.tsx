import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Seats } from "@pinochle/shared";
import { SEATS, SEAT_LABELS_LOWER, getTableOrder } from "@pinochle/shared";
import { useAuth } from "../auth/AuthContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { GameScreen } from "../game/GameScreen";
import type { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Room">;

function normalizeSeats(raw: Record<string, string | null>): Seats {
  const result: Seats = {};
  for (const [key, value] of Object.entries(raw)) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

export function RoomScreen({ route, navigation }: Props) {
  const { roomCode } = route.params;
  const { user, token } = useAuth();
  const { sendMessage, lastEvent, connected } = useWebSocket(
    roomCode,
    token!,
  );

  const [seats, setSeats] = useState<Seats>({
    north: null,
    east: null,
    south: null,
    west: null,
  });
  const [error, setError] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [myHand, setMyHand] = useState<string[]>([]);

  useEffect(() => {
    if (!lastEvent) return;

    if (lastEvent.event === "LOBBY_STATE_UPDATED") {
      const payload = lastEvent.payload as { seats: Seats };
      setSeats(normalizeSeats(payload.seats));
      setError("");
    } else if (lastEvent.event === "SEAT_CLAIM_FAILED") {
      const payload = lastEvent.payload as { reason: string };
      setError(payload.reason);
    } else if (lastEvent.event === "HAND_DEALT") {
      const payload = lastEvent.payload as { cards: string[] };
      setMyHand(payload.cards);
      setGameStarted(true);
    }
  }, [lastEvent]);

  function handleSit(seat: string) {
    setError("");
    sendMessage({ action: "SELECT_SEAT", payload: { seat } });
  }

  function handleStart() {
    sendMessage({ action: "START_GAME" });
  }

  const allSeated = SEATS.every((s) => seats[s]);
  const username = user!.username;

  const mySeat =
    Object.entries(seats).find(
      ([, occupant]) => occupant === username,
    )?.[0] ?? null;

  if (gameStarted && mySeat) {
    return (
      <GameScreen
        sendMessage={sendMessage}
        lastEvent={lastEvent}
        connected={connected}
        roomCode={roomCode}
        mySeat={mySeat.toUpperCase()}
        initialHand={myHand}
        seatPlayers={seats}
        onLeave={() => navigation.goBack()}
      />
    );
  }

  const [bottom, left, top, right] = getTableOrder(mySeat);
  const positions = [
    { seat: top, gridPos: "top" as const },
    { seat: left, gridPos: "left" as const },
    { seat: right, gridPos: "right" as const },
    { seat: bottom, gridPos: "bottom" as const },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.roomCode}>{roomCode}</Text>
      <Text style={styles.roomLabel}>Share this code with other players</Text>

      <View style={styles.connectionRow}>
        <View
          style={[
            styles.connectionDot,
            connected ? styles.dotConnected : styles.dotDisconnected,
          ]}
        />
        <Text style={styles.connectionText}>
          {connected ? "Connected" : "Disconnected"}
        </Text>
      </View>

      {error !== "" && <Text style={styles.error}>{error}</Text>}

      <View style={styles.table}>
        {positions.map(({ seat, gridPos }) => {
          const occupant = seats[seat];
          const isSelf = occupant === username;

          return (
            <View
              key={seat}
              style={[
                styles.seat,
                gridPos === "top" && styles.seatTop,
                gridPos === "left" && styles.seatLeft,
                gridPos === "right" && styles.seatRight,
                gridPos === "bottom" && styles.seatBottom,
                isSelf && styles.seatSelf,
                occupant && !isSelf ? styles.seatOccupied : null,
              ]}
            >
              <Text style={styles.seatLabel}>{SEAT_LABELS_LOWER[seat]}</Text>
              {occupant ? (
                <Text style={styles.seatPlayer}>{occupant}</Text>
              ) : (
                <>
                  <Text style={styles.seatEmpty}>Empty</Text>
                  <TouchableOpacity
                    style={styles.sitButton}
                    onPress={() => handleSit(seat)}
                  >
                    <Text style={styles.sitButtonText}>Sit</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          );
        })}
      </View>

      {allSeated && (
        <TouchableOpacity style={styles.startButton} onPress={handleStart}>
          <Text style={styles.startButtonText}>Start Game</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.leaveButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.leaveButtonText}>Leave Room</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a3a1a",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  roomCode: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: 8,
    marginBottom: 4,
  },
  roomLabel: {
    color: "#aaa",
    fontSize: 13,
    marginBottom: 16,
  },
  connectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotConnected: {
    backgroundColor: "#4caf50",
  },
  dotDisconnected: {
    backgroundColor: "#f44336",
  },
  connectionText: {
    color: "#aaa",
    fontSize: 13,
  },
  error: {
    color: "#f44336",
    fontSize: 13,
    marginBottom: 8,
    backgroundColor: "rgba(244,67,54,0.15)",
    padding: 8,
    borderRadius: 4,
  },
  table: {
    width: 280,
    height: 280,
    position: "relative",
    marginVertical: 20,
  },
  seat: {
    position: "absolute",
    width: 100,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  seatTop: {
    top: 0,
    left: 90,
  },
  seatLeft: {
    top: 100,
    left: 0,
  },
  seatRight: {
    top: 100,
    right: 0,
  },
  seatBottom: {
    bottom: 0,
    left: 90,
  },
  seatSelf: {
    borderWidth: 2,
    borderColor: "#4caf50",
  },
  seatOccupied: {
    borderWidth: 1,
    borderColor: "#4a90d9",
  },
  seatLabel: {
    color: "#eee",
    fontWeight: "600",
    fontSize: 13,
    marginBottom: 4,
  },
  seatPlayer: {
    color: "#fff",
    fontSize: 12,
  },
  seatEmpty: {
    color: "#888",
    fontSize: 12,
    marginBottom: 4,
  },
  sitButton: {
    backgroundColor: "#4a90d9",
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  sitButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  startButton: {
    backgroundColor: "#2e7d32",
    borderRadius: 8,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginBottom: 12,
  },
  startButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  leaveButton: {
    padding: 12,
  },
  leaveButtonText: {
    color: "#f44336",
    fontSize: 15,
  },
});
