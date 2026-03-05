import { useState, useEffect } from "react";
import type { StatsOverview } from "../types/game";
import { getPlayerStats } from "../services/api";
import "./styles/Statistics.css";

interface StatisticsProps {
  playerId: string;
}

function Statistics({ playerId }: StatisticsProps) {
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPlayerStats(playerId);
        if (!cancelled) {
          setStats(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load stats.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (loading) {
    return <div className="stats-loading">Loading statistics...</div>;
  }

  if (error) {
    return <div className="stats-empty">{error}</div>;
  }

  if (!stats || stats.total_games === 0) {
    return <div className="stats-empty">No games played yet.</div>;
  }

  return (
    <div className="statistics">
      <div className="stats-overview">
        <div className="stat-card">
          <div className="stat-value">{stats.total_games}</div>
          <div className="stat-label">Games</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.total_wins}</div>
          <div className="stat-label">Wins</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.total_losses}</div>
          <div className="stat-label">Losses</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{(stats.win_rate * 100).toFixed(0)}%</div>
          <div className="stat-label">Win Rate</div>
        </div>
      </div>

      {stats.per_opponent.length > 0 && (
        <table className="opponent-table">
          <thead>
            <tr>
              <th>Opponent</th>
              <th>Played</th>
              <th>Won</th>
              <th>Lost</th>
            </tr>
          </thead>
          <tbody>
            {stats.per_opponent.map((opp) => (
              <tr key={opp.opponent_nickname}>
                <td>{opp.opponent_nickname}</td>
                <td>{opp.games_played}</td>
                <td>{opp.games_won}</td>
                <td>{opp.games_lost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default Statistics;
