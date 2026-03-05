import { useState, useEffect } from "react";
import type { DashboardData, GameHistoryItem } from "../types/game";
import { getPlayerDashboard } from "../services/api";
import "./styles/Dashboard.css";

interface DashboardProps {
  playerId: string;
}

/** Format an ISO date string to a human-readable form, e.g. "Mar 4, 2026". */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Return a display-friendly win type label. */
function formatWinType(item: GameHistoryItem): string {
  if (item.result === "abandoned" || !item.win_type) {
    return "-";
  }
  switch (item.win_type) {
    case "normal":
      return "Normal";
    case "gammon":
      return "Gammon";
    case "backgammon":
      return "Backgammon";
    default:
      return item.win_type;
  }
}

/** Return the CSS class for a result badge. */
function resultClass(result: GameHistoryItem["result"]): string {
  switch (result) {
    case "win":
      return "result-badge result-win";
    case "loss":
      return "result-badge result-loss";
    case "abandoned":
      return "result-badge result-abandoned";
    default:
      return "result-badge";
  }
}

/** Return a display label for the result. */
function resultLabel(result: GameHistoryItem["result"]): string {
  switch (result) {
    case "win":
      return "Win";
    case "loss":
      return "Loss";
    case "abandoned":
      return "Abandoned";
    default:
      return result;
  }
}

function Dashboard({ playerId }: DashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      setLoading(true);
      setError(null);
      try {
        const dashboard = await getPlayerDashboard(playerId);
        if (!cancelled) {
          setData(dashboard);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load dashboard.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchDashboard();

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="dashboard-empty">{error}</div>;
  }

  if (!data || data.total_games === 0) {
    return <div className="dashboard-empty">No games played yet.</div>;
  }

  return (
    <div className="dashboard">
      {/* Summary stat cards */}
      <div className="dashboard-overview">
        <div className="stat-card">
          <div className="stat-value">{data.total_games}</div>
          <div className="stat-label">Games Played</div>
        </div>
        <div className="stat-card">
          <div className="stat-value dashboard-wins">{data.wins}</div>
          <div className="stat-label">Wins</div>
        </div>
        <div className="stat-card">
          <div className="stat-value dashboard-losses">{data.losses}</div>
          <div className="stat-label">Losses</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.win_rate.toFixed(0)}%</div>
          <div className="stat-label">Win Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-value dashboard-abandoned">
            {data.abandoned_games}
          </div>
          <div className="stat-label">Abandoned</div>
        </div>
      </div>

      {/* Game history table */}
      {data.games.length > 0 && (
        <table className="opponent-table dashboard-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Opponent</th>
              <th>Color</th>
              <th>Result</th>
              <th>Win Type</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {data.games.map((game) => (
              <tr key={game.table_id}>
                <td>{formatDate(game.played_at)}</td>
                <td>{game.opponent_nickname}</td>
                <td>
                  <span
                    className={`color-indicator color-${game.player_color}`}
                    title={
                      game.player_color === "white" ? "White" : "Black"
                    }
                  />
                </td>
                <td>
                  <span className={resultClass(game.result)}>
                    {resultLabel(game.result)}
                  </span>
                </td>
                <td>{formatWinType(game)}</td>
                <td>{game.score != null ? game.score : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Dashboard;
