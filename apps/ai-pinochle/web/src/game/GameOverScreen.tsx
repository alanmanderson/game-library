import styles from "./GameOverScreen.module.css";

interface Props {
  winnerTeam: string;
  finalScores: Record<string, number>;
  myTeam: string;
  forfeitNote?: string | null;
  rematchRequested: boolean;
  pendingSeats: string[];
  seatPlayers: Record<string, string | null>;
  onRematch: () => void;
  onLeaveToLobby: () => void;
}

export function GameOverScreen({
  winnerTeam,
  finalScores,
  myTeam,
  forfeitNote,
  rematchRequested,
  pendingSeats,
  seatPlayers,
  onRematch,
  onLeaveToLobby,
}: Props) {
  const youWon = winnerTeam === myTeam;
  const otherTeam = winnerTeam === "NS" ? "EW" : "NS";

  const waitingNames = pendingSeats
    .map((s) => seatPlayers[s.toLowerCase()] ?? s)
    .join(", ");

  return (
    <div className={styles.container} role="status" aria-live="polite">
      <h2 className={styles.headline}>
        {youWon ? "Victory!" : "Game Over"}
      </h2>
      <p className={styles.banner}>
        <strong>{winnerTeam}</strong> wins the game
      </p>
      {forfeitNote && <p className={styles.forfeit}>{forfeitNote}</p>}

      <div className={styles.scores}>
        <div className={`${styles.scoreCard} ${winnerTeam === "NS" ? styles.winnerCard : ""}`}>
          <span className={styles.teamLabel}>NS</span>
          <span className={styles.scoreValue}>{finalScores.NS}</span>
        </div>
        <div className={`${styles.scoreCard} ${winnerTeam === "EW" ? styles.winnerCard : ""}`}>
          <span className={styles.teamLabel}>EW</span>
          <span className={styles.scoreValue}>{finalScores.EW}</span>
        </div>
      </div>

      <p className={styles.finalLine}>
        Final: <strong>{winnerTeam} {finalScores[winnerTeam]}</strong>
        {" vs "}
        <strong>{otherTeam} {finalScores[otherTeam]}</strong>
      </p>

      <div className={styles.actions}>
        <button
          className={styles.rematchButton}
          onClick={onRematch}
          disabled={rematchRequested}
        >
          {rematchRequested ? "Waiting for others…" : "Rematch"}
        </button>
        <button className={styles.lobbyButton} onClick={onLeaveToLobby}>
          Leave to Lobby
        </button>
      </div>

      {rematchRequested && pendingSeats.length > 0 && (
        <p className={styles.waiting}>Waiting on: {waitingNames}</p>
      )}
      {rematchRequested && pendingSeats.length === 0 && (
        <p className={styles.waiting}>Starting new game…</p>
      )}
    </div>
  );
}
