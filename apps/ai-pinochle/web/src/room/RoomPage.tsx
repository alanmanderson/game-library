import { Suspense, lazy, useState } from "react";
import type { Seats, WsEvent } from "@pinochle/shared";
import {
  SEATS,
  SEAT_LABELS_LOWER,
  getTableOrder,
  sendAction,
  useGameState,
} from "@pinochle/shared";
import { useAuth } from "../auth/AuthContext.tsx";
import { useWebSocket } from "../hooks/useWebSocket.ts";
import { GameErrorBoundary } from "../game/GameErrorBoundary.tsx";
import { Loading } from "../ui/Loading.tsx";
import styles from "./RoomPage.module.css";

// GamePage + the seven phase components are the heaviest slice of the bundle;
// only fetch once a hand has actually been dealt. See issue #14.
const GamePage = lazy(() =>
  import("../game/GamePage.tsx").then((m) => ({ default: m.GamePage })),
);

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

  const [seats, setSeats] = useState<Seats>({
    north: null,
    east: null,
    south: null,
    west: null,
  });
  const [mySeat, setMySeat] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const { sendMessage, connected } = useWebSocket(roomCode, token!, {
    onEvent: (event) => handleEvent(event),
  });

  const game = useGameState({ mySeat, sendMessage });

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
        game.applyEvent(event);
        return;
      case "LEFT_TO_LOBBY":
        onLeave();
        return;
      default:
        game.applyEvent(event);
        return;
    }
  }

  async function copyText(text: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Older browsers without clipboard API — user can still select text manually.
    }
  }

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
      <GameErrorBoundary roomCode={roomCode} onLeave={onLeave}>
        <Suspense fallback={<Loading label="Loading game..." />}>
          <GamePage
            sendMessage={sendMessage}
            connected={connected}
            game={game}
            mySeat={mySeat.toUpperCase()}
            seatPlayers={seats}
            onLeave={onLeave}
          />
        </Suspense>
      </GameErrorBoundary>
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
