import { useEffect, useState } from "react";
import type { GameSummary } from "@pinochle/shared";
import { SEATS } from "@pinochle/shared";
import { useAuth } from "../auth/AuthContext.tsx";
import { getAuth, ApiError } from "../api/client.ts";
import styles from "./MyGamesPage.module.css";

const PHASE_LABELS: Record<string, string> = {
  LOBBY_WAITING: "Waiting",
  BIDDING: "Bidding",
  NAMING_TRUMP: "Naming Trump",
  PASSING_CARDS: "Passing Cards",
  SHOWING_MELD: "Showing Meld",
  TRICK_PLAYING: "Playing Tricks",
  HAND_COMPLETE: "Hand Complete",
};

interface Props {
  onBack: () => void;
  onOpenGame: (roomCode: string) => void;
}

export function MyGamesPage({ onBack, onOpenGame }: Props) {
  const { token } = useAuth();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      try {
        const data = await getAuth<GameSummary[]>("/games/mine", token!);
        if (!cancelled) setGames(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.detail : "Failed to load games",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [token]);

  function statusLabel(game: GameSummary): string {
    if (game.status === "IN_PROGRESS") {
      return PHASE_LABELS[game.phase] ?? game.phase;
    }
    if (game.status === "COMPLETED") return "Completed";
    return "Abandoned";
  }

  function playerList(game: GameSummary): string {
    return SEATS
      .map((seat) => game.players[seat])
      .filter(Boolean)
      .join(", ");
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backButton} onClick={onBack}>
          Back
        </button>
        <h2>My Games</h2>
      </div>

      {loading && <p className={styles.loading}>Loading...</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && games.length === 0 && (
        <p className={styles.empty}>No games yet. Create or join a room to get started!</p>
      )}

      {!loading && !error && games.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Room</th>
              <th>Status</th>
              <th>NS Score</th>
              <th>EW Score</th>
              <th>Players</th>
            </tr>
          </thead>
          <tbody>
            {games.map((game) => (
              <tr key={game.room_code}>
                <td>
                  <button
                    className={styles.roomLink}
                    onClick={() => onOpenGame(game.room_code)}
                  >
                    {game.room_code}
                  </button>
                </td>
                <td className={game.status === "IN_PROGRESS" ? styles.statusActive : styles.statusDone}>
                  {statusLabel(game)}
                </td>
                <td>{game.ns_score}</td>
                <td>{game.ew_score}</td>
                <td>{playerList(game)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
