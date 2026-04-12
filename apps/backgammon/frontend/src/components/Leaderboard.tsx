import { useState, useEffect, useCallback } from "react";
import type { LeaderboardEntry } from "../types/game";
import { getLeaderboard } from "../services/api";
import "./styles/Leaderboard.css";

type Metric = "wins" | "win_rate" | "rating";

interface LeaderboardProps {
  playerId: string | null;
  onBack: () => void;
}

const TABS: { value: Metric; label: string }[] = [
  { value: "wins", label: "Most Wins" },
  { value: "win_rate", label: "Win Rate" },
  { value: "rating", label: "Rating" },
];

const PAGE_SIZE = 25;

function Leaderboard({ playerId, onBack }: LeaderboardProps) {
  const [metric, setMetric] = useState<Metric>("wins");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(
    async (selectedMetric: Metric, offset: number, append: boolean) => {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const data = await getLeaderboard(selectedMetric, PAGE_SIZE, offset);
        setTotal(data.total);
        setEntries((prev) => (append ? [...prev, ...data.entries] : data.entries));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load leaderboard.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchLeaderboard(metric, 0, false);
  }, [metric, fetchLeaderboard]);

  const handleTabChange = (newMetric: Metric) => {
    setMetric(newMetric);
    setEntries([]);
  };

  const handleLoadMore = () => {
    fetchLeaderboard(metric, entries.length, true);
  };

  const rankClass = (rank: number) => {
    if (rank === 1) return "leaderboard-rank leaderboard-rank-1";
    if (rank === 2) return "leaderboard-rank leaderboard-rank-2";
    if (rank === 3) return "leaderboard-rank leaderboard-rank-3";
    return "leaderboard-rank";
  };

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <button className="leaderboard-back-btn" onClick={onBack}>
          Back
        </button>
        <h2>Leaderboard</h2>
        <div className="leaderboard-header-spacer" />
      </div>

      <div className="leaderboard-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={metric === tab.value}
            className={`leaderboard-tab${metric === tab.value ? " active" : ""}`}
            onClick={() => handleTabChange(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <p className="leaderboard-loading">Loading...</p>}
      {error && <p className="leaderboard-error">{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p className="leaderboard-empty">
          {metric === "rating"
            ? "No players with enough rated games yet."
            : "No games played yet."}
        </p>
      )}

      {entries.length > 0 && (
        <>
          <div className="leaderboard-table-wrapper">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Wins</th>
                  <th>Games</th>
                  <th>Win&nbsp;Rate</th>
                  {metric === "rating" && <th>Rating</th>}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isSelf = playerId !== null && entry.player_id === playerId;
                  return (
                    <tr
                      key={entry.player_id}
                      className={isSelf ? "leaderboard-row-self" : undefined}
                    >
                      <td className={rankClass(entry.rank)}>{entry.rank}</td>
                      <td className="leaderboard-nickname">
                        {entry.nickname}
                        {isSelf && <span className="leaderboard-you-badge">You</span>}
                      </td>
                      <td>{entry.total_wins}</td>
                      <td>{entry.total_games}</td>
                      <td>{entry.win_rate.toFixed(1)}%</td>
                      {metric === "rating" && <td>{entry.rating}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="leaderboard-count">
            Showing {entries.length} of {total} players
          </p>

          {entries.length < total && (
            <button
              className="leaderboard-load-more"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default Leaderboard;
