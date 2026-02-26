import { useState, useEffect } from "react";
import type { Seats } from "@pinochle/shared";
import { SEATS, SEAT_LABELS_LOWER, getTableOrder } from "@pinochle/shared";
import { useAuth } from "../auth/AuthContext.tsx";
import { useWebSocket } from "../hooks/useWebSocket.ts";
import { GamePage } from "../game/GamePage.tsx";
import styles from "./RoomPage.module.css";

interface Props {
  roomCode: string;
  onLeave: () => void;
}

function normalizeSeats(raw: Record<string, string | null>): Seats {
  const result: Seats = {};
  for (const [key, value] of Object.entries(raw)) {
    result[key.toLowerCase()] = value;
  }
  return result;
}

export function RoomPage({ roomCode, onLeave }: Props) {
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
    Object.entries(seats).find(([, occupant]) => occupant === username)?.[0] ?? null;

  if (gameStarted && mySeat) {
    return (
      <GamePage
        sendMessage={sendMessage}
        lastEvent={lastEvent}
        connected={connected}
        roomCode={roomCode}
        mySeat={mySeat.toUpperCase()}
        initialHand={myHand}
        seatPlayers={seats}
        onLeave={onLeave}
      />
    );
  }

  const [bottom, left, top, right] = getTableOrder(mySeat);
  const positions = [
    { seat: top, position: "top" as const },
    { seat: left, position: "left" as const },
    { seat: right, position: "right" as const },
    { seat: bottom, position: "bottom" as const },
  ];

  return (
    <div className={styles.container}>
      <p className={styles.roomCodeDisplay}>{roomCode}</p>
      <p className={styles.roomLabel}>Share this code with other players</p>

      <p className={styles.connectionStatus}>
        <span
          className={`${styles.connectionDot} ${connected ? styles.dotConnected : styles.dotDisconnected}`}
        />
        {connected ? "Connected" : "Disconnected"}
      </p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.table}>
        {positions.map(({ seat, position }) => {
          const occupant = seats[seat];
          const isSelf = occupant === username;
          const posClass = styles[`seat_${position}`];

          return (
            <div
              key={seat}
              className={`${styles.seat} ${posClass} ${isSelf ? styles.seatSelf : occupant ? styles.seatOccupied : ""}`}
            >
              <p className={styles.seatLabel}>{SEAT_LABELS_LOWER[seat]}</p>
              {occupant ? (
                <p className={styles.seatPlayer}>{occupant}</p>
              ) : (
                <>
                  <p className={styles.seatEmpty}>Empty</p>
                  <button
                    className={styles.sitButton}
                    onClick={() => handleSit(seat)}
                  >
                    Sit
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {allSeated && (
        <button className={styles.startButton} onClick={handleStart}>
          Start Game
        </button>
      )}

      <button className={styles.leaveButton} onClick={onLeave}>
        Leave Room
      </button>
    </div>
  );
}
