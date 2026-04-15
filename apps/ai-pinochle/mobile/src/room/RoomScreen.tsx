import React, { useState, useReducer } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Seats, WsEvent } from "@pinochle/shared";
import {
  SEATS,
  SEAT_LABELS_LOWER,
  getTableOrder,
  sendAction,
  gameReducer,
  initialGameState,
} from "@pinochle/shared";
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
  const { token } = useAuth();

  const [seats, setSeats] = useState<Seats>({
    north: null,
    east: null,
    south: null,
    west: null,
  });
  const [mySeat, setMySeat] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [gameStarted, setGameStarted] = useState(false);

  const [gameState, dispatch] = useReducer(gameReducer, initialGameState([]));

  function handleEvent(event: WsEvent) {
    switch (event.event) {
      case "LOBBY_STATE_UPDATED": {
        const p = event.payload;
        setSeats(normalizeSeats(p.seats));
        if (p.your_seat) setMySeat(p.your_seat.toLowerCase());
        setError("");
        return;
      }
      case "SEAT_CLAIM_FAILED":
        setError(event.payload.message);
        return;
      case "HAND_DEALT":
        setGameStarted(true);
        dispatch({ type: "WS_EVENT", event, mySeat: (mySeat ?? "").toUpperCase() });
        return;
      case "LEFT_TO_LOBBY":
        navigation.goBack();
        return;
      default:
        dispatch({ type: "WS_EVENT", event, mySeat: (mySeat ?? "").toUpperCase() });
        return;
    }
  }

  const { sendMessage, connected } = useWebSocket(roomCode, token!, {
    onEvent: handleEvent,
  });

  function handleSit(seat: string) {
    setError("");
    sendAction(sendMessage, { action: "SELECT_SEAT", payload: { seat } });
  }

  function handleStart() {
    sendAction(sendMessage, { action: "START_GAME", payload: {} });
  }

  const allSeated = SEATS.every((s) => seats[s]);

  if (gameStarted && mySeat) {
    return (
      <GameScreen
        sendMessage={sendMessage}
        connected={connected}
        state={gameState}
        dispatch={dispatch}
        mySeat={mySeat.toUpperCase()}
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
          const isSelf = seat === mySeat;

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
                    <Text style={styles.sitButtonText}>Sit here</Text>
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
