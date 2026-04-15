import { useState, useEffect, useCallback } from "react";
import type { LeaderboardEntry, LeaderboardPeriod } from "../types/game";
import { getLeaderboard } from "../services/api";
import { TIER_COLORS, tierForRating, type Tier } from "../constants/tiers";
import "./styles/Leaderboard.css";

type Metric = "wins" | "win_rate" | "rating";

interface LeaderboardProps {
  playerId: string | null;
  onBack: () => void;
  embedded?: boolean;
}

const TABS: { value: Metric; label: string }[] = [
  { value: "wins", label: "Most Wins" },
  { value: "win_rate", label: "Win Rate" },
  { value: "rating", label: "Rating" },
];

const PERIOD_TABS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "all_time", label: "All Time" },
  { value: "month", label: "This Month" },
  { value: "week", label: "This Week" },
];

const PAGE_SIZE = 25;

function Leaderboard({ playerId, onBack, embedded }: LeaderboardProps) {
  const [metric, setMetric] = useState<Metric>("wins");
  const [period, setPeriod] = useState<LeaderboardPeriod>("all_time");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [viewerEntry, setViewerEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(
    async (
      selectedMetric: Metric,
      selectedPeriod: LeaderboardPeriod,
      offset: number,
      append: boolean,
    ) => {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const data = await getLeaderboard(
          selectedMetric,
          PAGE_SIZE,
          offset,
          selectedPeriod,
          playerId,
        );
        setTotal(data.total);
        setViewerEntry(data.viewer_entry ?? null);
        setEntries((prev) => (append ? [...prev, ...data.entries] : data.entries));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load leaderboard.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [playerId],
  );

  useEffect(() => {
    fetchLeaderboard(metric, period, 0, false);
  }, [metric, period, fetchLeaderboard]);

  const handleTabChange = (newMetric: Metric) => {
    setMetric(newMetric);
    setEntries([]);
  };

  const handlePeriodChange = (newPeriod: LeaderboardPeriod) => {
    setPeriod(newPeriod);
    setEntries([]);
  };

  const handleLoadMore = () => {
    fetchLeaderboard(metric, period, entries.length, true);
  };

  const rankClass = (rank: number) => {
    if (rank === 1) return "leaderboard-rank leaderboard-rank-1";
    if (rank === 2) return "leaderboard-rank leaderboard-rank-2";
    if (rank === 3) return "leaderboard-rank leaderboard-rank-3";
    return "leaderboard-rank";
  };

  const emptyMessage =
    period === "all_time"
      ? metric === "rating"
        ? "No players with enough rated games yet."
        : "No games played yet."
      : period === "week"
        ? "No games played this week yet."
        : "No games played this month yet.";

  return (
    <div className={`leaderboard${embedded ? " leaderboard--embedded" : ""}`}>
      {!embedded && (
        <div className="leaderboard-header">
          <button className="leaderboard-back-btn" onClick={onBack}>
            Back
          </button>
          <h2>Leaderboard</h2>
          <div className="leaderboard-header-spacer" />
        </div>
      )}

      <div className="leaderboard-tabs" role="tablist" aria-label="Metric">
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

      <div
        className="leaderboard-period-tabs"
        role="tablist"
        aria-label="Time period"
      >
        {PERIOD_TABS.map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={period === tab.value}
            className={`leaderboard-period-tab${period === tab.value ? " active" : ""}`}
            onClick={() => handlePeriodChange(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <p className="leaderboard-loading">Loading...</p>}
      {error && <p className="leaderboard-error">{error}</p>}

      {!loading && !error && entries.length === 0 && (
        <p className="leaderboard-empty">{emptyMessage}</p>
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
                      {metric === "rating" && (
                        <td>
                          {entry.rating}
                          <span
                            className="leaderboard-tier-badge"
                            style={{
                              color: TIER_COLORS[(entry.tier ?? tierForRating(entry.rating)) as Tier],
                              borderColor: TIER_COLORS[(entry.tier ?? tierForRating(entry.rating)) as Tier],
                            }}
                          >
                            {entry.tier ?? tierForRating(entry.rating)}
                          </span>
                        </td>
                      )}
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

          {viewerEntry && (
            <div className="leaderboard-self-footer" role="status">
              <span className="leaderboard-self-footer-label">You:</span>
              <span className="leaderboard-self-footer-rank">
                #{viewerEntry.rank}
              </span>
              <span className="leaderboard-self-footer-meta">
                {viewerEntry.rating} rating &middot; {viewerEntry.total_games}{" "}
                {viewerEntry.total_games === 1 ? "game" : "games"}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Leaderboard;
