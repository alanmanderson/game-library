import { useState, useEffect } from "react";
import type { Seats } from "@pinochle/shared";
import { SEATS, SEAT_LABELS_LOWER, getTableOrder, sendAction } from "@pinochle/shared";
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
  const { token } = useAuth();
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
  const [mySeat, setMySeat] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [myHand, setMyHand] = useState<string[]>([]);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  async function copyText(text: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Older browsers without clipboard API — user can still select text manually.
    }
  }

  useEffect(() => {
    if (!lastEvent) return;

    switch (lastEvent.event) {
      case "LOBBY_STATE_UPDATED": {
        const p = lastEvent.payload;
        setSeats(normalizeSeats(p.seats));
        if (p.your_seat) setMySeat(p.your_seat.toLowerCase());
        setError("");
        return;
      }
      case "SEAT_CLAIM_FAILED":
        setError(lastEvent.payload.message);
        return;
      case "HAND_DEALT":
        setMyHand(lastEvent.payload.cards);
        setGameStarted(true);
        return;
      default:
        // Other events are handled by GamePage once it mounts.
        return;
    }
  }, [lastEvent]);

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
      <div className={styles.codeRow}>
        <p className={styles.roomCodeDisplay}>{roomCode}</p>
        <div className={styles.codeActions}>
          <button
            className={styles.copyButton}
            onClick={() => copyText(roomCode, "code")}
            aria-label="Copy room code"
          >
            {copied === "code" ? "Copied!" : "Copy code"}
          </button>
          <button
            className={styles.copyButton}
            onClick={() => copyText(`${window.location.origin}/${roomCode}`, "link")}
            aria-label="Copy join link"
          >
            {copied === "link" ? "Copied!" : "Copy link"}
          </button>
        </div>
      </div>
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
          const isSelf = seat === mySeat;
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
                    Sit here
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
