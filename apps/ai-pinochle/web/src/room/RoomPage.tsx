import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext.tsx";
import { useWebSocket } from "../hooks/useWebSocket.ts";
import styles from "./RoomPage.module.css";

const SEATS = ["north", "east", "south", "west"] as const;

const SEAT_LABELS: Record<string, string> = {
  north: "North",
  east: "East",
  south: "South",
  west: "West",
};

interface Props {
  roomCode: string;
  onLeave: () => void;
}

type Seats = Record<string, string | null>;

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

  useEffect(() => {
    if (!lastEvent) return;

    if (lastEvent.event === "LOBBY_STATE_UPDATED") {
      const payload = lastEvent.payload as { seats: Seats };
      setSeats(payload.seats);
      setError("");
    } else if (lastEvent.event === "SEAT_CLAIM_FAILED") {
      const payload = lastEvent.payload as { reason: string };
      setError(payload.reason);
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

      <div className={styles.seatsGrid}>
        {SEATS.map((seat) => {
          const occupant = seats[seat];
          const isSelf = occupant === username;

          return (
            <div
              key={seat}
              className={`${styles.seat} ${isSelf ? styles.seatSelf : occupant ? styles.seatOccupied : ""}`}
            >
              <p className={styles.seatLabel}>{SEAT_LABELS[seat]}</p>
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
