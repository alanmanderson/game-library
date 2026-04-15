import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { DashboardData, GameHistoryItem } from "../types/game";
import { getPlayerDashboard, exportGame } from "../services/api";
import { TIER_COLORS, tierForRating, type Tier } from "../constants/tiers";
import AdvancedStats from "./AdvancedStats";
import SeasonHistory from "./SeasonHistory";
import "./styles/Dashboard.css";

type DashboardTab = "history" | "stats";

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

/** Whether the game can be resumed (abandoned but table still active). */
function isResumable(game: GameHistoryItem): boolean {
  return (
    game.result === "abandoned" &&
    (game.table_status === "playing" || game.table_status === "game_over")
  );
}

/** Return the CSS class for a result badge. */
function resultClass(game: GameHistoryItem): string {
  if (isResumable(game)) {
    return "result-badge result-resume";
  }
  switch (game.result) {
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
function resultLabel(game: GameHistoryItem): string {
  if (isResumable(game)) {
    return "Resume";
  }
  switch (game.result) {
    case "win":
      return "Win";
    case "loss":
      return "Loss";
    case "abandoned":
      return "Abandoned";
    default:
      return game.result;
  }
}

function Dashboard({ playerId }: DashboardProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [tab, setTab] = useState<DashboardTab>("history");

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

  /** Trigger a browser download of the game export for `tableId`. */
  async function handleExport(tableId: string) {
    setExportError(null);
    try {
      const text = await exportGame(tableId);
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `game_${tableId}.mat`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to export game.",
      );
    }
  }

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  if (error) {
    return <div className="dashboard-empty">{error}</div>;
  }

  if (!data || data.total_games === 0) {
    return <div className="dashboard-empty">No games played yet.</div>;
  }

  const tier = (data.tier ?? tierForRating(data.rating)) as Tier;

  return (
    <div className="dashboard">
      {data.active_season && (
        <div className="dashboard-season-banner">
          <span className="dashboard-season-label">Current Season</span>
          <span className="dashboard-season-name">{data.active_season.name}</span>
        </div>
      )}

      {/* Summary stat cards */}
      <div className="dashboard-overview">
        <div className="stat-card">
          <div className="stat-value dashboard-rating">{data.rating}</div>
          <div className="stat-label">
            Rating
            <span
              className="dashboard-tier-badge"
              style={{ color: TIER_COLORS[tier], borderColor: TIER_COLORS[tier] }}
            >
              {tier}
            </span>
          </div>
        </div>
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

      {/* Tab switcher: game history vs advanced stats */}
      <div className="dashboard-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          className={`dashboard-tab ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          Game History
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "stats"}
          className={`dashboard-tab ${tab === "stats" ? "active" : ""}`}
          onClick={() => setTab("stats")}
        >
          Advanced Stats
        </button>
      </div>

      {exportError && tab === "history" && (
        <div className="dashboard-empty">{exportError}</div>
      )}

      {tab === "stats" && (
        <>
          <AdvancedStats playerId={playerId} />
          <SeasonHistory playerId={playerId} />
        </>
      )}

      {/* Game history table */}
      {tab === "history" && data.games.length > 0 && (
        <table className="opponent-table dashboard-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Opponent</th>
              <th>Color</th>
              <th>Result</th>
              <th>Win Type</th>
              <th>Score</th>
              <th>Replay</th>
              <th>Export</th>
            </tr>
          </thead>
          <tbody>
            {data.games.map((game) => {
              const resumable = isResumable(game);
              const replayable = game.result !== "abandoned" && game.table_status === "finished";
              return (
                <tr
                  key={game.table_id}
                  className={resumable ? "resumable-row" : undefined}
                  onClick={
                    resumable
                      ? () => navigate(`/game/${game.table_id}`)
                      : undefined
                  }
                >
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
                    <span className={resultClass(game)}>
                      {resultLabel(game)}
                    </span>
                  </td>
                  <td>{formatWinType(game)}</td>
                  <td>{game.score != null ? game.score : "-"}</td>
                  <td>
                    {replayable && (
                      <button
                        className="replay-link-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/replay/${game.table_id}`);
                        }}
                        title="Replay this game"
                        aria-label={`Replay game against ${game.opponent_nickname}`}
                      >
                        ▶ Replay
                      </button>
                    )}
                  </td>
                  <td>
                    {game.result !== "abandoned" && (
                      <button
                        className="export-btn"
                        title="Download game as .mat file"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExport(game.table_id);
                        }}
                      >
                        ↓
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Dashboard;
