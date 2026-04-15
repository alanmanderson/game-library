import { useState, useEffect } from "react";
import type { AdvancedStatsData, RatingHistoryPoint } from "../types/game";
import { getPlayerAdvancedStats } from "../services/api";
import "./styles/AdvancedStats.css";

interface AdvancedStatsProps {
  playerId: string;
}

/** Format a percentage to a whole-number display string. */
function pct(n: number): string {
  return `${n.toFixed(0)}%`;
}

/** Pretty-printed label for a time-control key. */
function formatTimeControl(tc: string): string {
  if (!tc) return "Unknown";
  return tc.charAt(0).toUpperCase() + tc.slice(1);
}

/** Render a horizontal win/loss bar with wins overlaid on total games. */
function WinRateBar({
  label,
  games,
  wins,
  winRate,
}: {
  label: string;
  games: number;
  wins: number;
  winRate: number;
}) {
  return (
    <div className="adv-bar-row">
      <div className="adv-bar-label">{label}</div>
      <div
        className="adv-bar-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={winRate}
      >
        <div
          className="adv-bar-fill"
          style={{ width: `${Math.min(100, Math.max(0, winRate))}%` }}
        />
      </div>
      <div className="adv-bar-value">
        {pct(winRate)}{" "}
        <span className="adv-bar-meta">
          ({wins}/{games})
        </span>
      </div>
    </div>
  );
}

/** Simple responsive SVG line graph of rating_after over time. */
function RatingGraph({ history }: { history: RatingHistoryPoint[] }) {
  if (history.length === 0) {
    return (
      <div className="adv-rating-empty">
        Play a rated match to start building your rating history.
      </div>
    );
  }

  const width = 600;
  const height = 180;
  const padX = 30;
  const padY = 20;

  const ratings = history.map((p) => p.rating_after);
  const minR = Math.min(...ratings);
  const maxR = Math.max(...ratings);
  // Add a small vertical padding so flat lines don't hug the edge.
  const range = Math.max(10, maxR - minR);
  const yMin = minR - range * 0.1;
  const yMax = maxR + range * 0.1;

  const toX = (i: number): number => {
    if (history.length === 1) return width / 2;
    return padX + (i / (history.length - 1)) * (width - 2 * padX);
  };
  const toY = (r: number): number => {
    return padY + (1 - (r - yMin) / (yMax - yMin)) * (height - 2 * padY);
  };

  const points = history
    .map((p, i) => `${toX(i)},${toY(p.rating_after)}`)
    .join(" ");

  const currentRating = ratings[ratings.length - 1];
  const firstRating = ratings[0];
  const diff = currentRating - firstRating;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;

  return (
    <div className="adv-rating-graph">
      <div className="adv-rating-header">
        <span className="adv-rating-current">{currentRating}</span>
        <span
          className={
            diff >= 0 ? "adv-rating-diff-up" : "adv-rating-diff-down"
          }
        >
          {diffLabel} over {history.length} game{history.length === 1 ? "" : "s"}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="adv-rating-svg"
        preserveAspectRatio="none"
        role="img"
        aria-label="Rating history graph"
      >
        {/* Baseline at starting rating */}
        <line
          x1={padX}
          x2={width - padX}
          y1={toY(firstRating)}
          y2={toY(firstRating)}
          className="adv-rating-baseline"
        />
        <polyline points={points} className="adv-rating-line" />
        {history.map((p, i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(p.rating_after)}
            r={2.5}
            className="adv-rating-dot"
          />
        ))}
      </svg>
    </div>
  );
}

function AdvancedStats({ playerId }: AdvancedStatsProps) {
  const [data, setData] = useState<AdvancedStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      setLoading(true);
      setError(null);
      try {
        const stats = await getPlayerAdvancedStats(playerId);
        if (!cancelled) setData(stats);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load stats.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (loading) {
    return <div className="adv-stats-loading">Loading advanced stats...</div>;
  }

  if (error) {
    return <div className="adv-stats-empty">{error}</div>;
  }

  if (!data || data.total_games === 0) {
    return (
      <div className="adv-stats-empty">
        Play a few games to unlock advanced stats.
      </div>
    );
  }

  const tcEntries = Object.entries(data.win_rate_by_time_control);

  return (
    <div className="adv-stats">
      {/* Headline stat cards */}
      <div className="adv-stats-cards">
        <div className="adv-stat-card">
          <div className="adv-stat-value adv-stat-accent">
            {pct(data.gammon_rate)}
          </div>
          <div className="adv-stat-label">Gammon Rate</div>
          <div className="adv-stat-sub">
            {data.gammon_wins} won / {data.gammon_losses} lost
          </div>
        </div>
        <div className="adv-stat-card">
          <div className="adv-stat-value adv-stat-accent">
            {pct(data.backgammon_rate)}
          </div>
          <div className="adv-stat-label">Backgammon Rate</div>
          <div className="adv-stat-sub">
            {data.backgammon_wins} won / {data.backgammon_losses} lost
          </div>
        </div>
        <div className="adv-stat-card">
          <div className="adv-stat-value adv-stat-accent">
            {pct(data.cube_stats.accept_rate)}
          </div>
          <div className="adv-stat-label">Cube Accept Rate</div>
          <div className="adv-stat-sub">
            {data.cube_stats.offered} offered ·{" "}
            {data.cube_stats.accepted} taken ·{" "}
            {data.cube_stats.declined} dropped
          </div>
        </div>
      </div>

      {/* Win rate by color */}
      <section className="adv-section">
        <h3 className="adv-section-title">Win Rate by Color</h3>
        <WinRateBar
          label="As White"
          games={data.win_rate_as_white.games}
          wins={data.win_rate_as_white.wins}
          winRate={data.win_rate_as_white.win_rate}
        />
        <WinRateBar
          label="As Black"
          games={data.win_rate_as_black.games}
          wins={data.win_rate_as_black.wins}
          winRate={data.win_rate_as_black.win_rate}
        />
      </section>

      {/* Win rate by time control */}
      <section className="adv-section">
        <h3 className="adv-section-title">Win Rate by Time Control</h3>
        {tcEntries.length === 0 ? (
          <div className="adv-stats-empty">
            No completed games yet.
          </div>
        ) : (
          tcEntries.map(([tc, bucket]) => (
            <WinRateBar
              key={tc}
              label={formatTimeControl(tc)}
              games={bucket.games}
              wins={bucket.wins}
              winRate={bucket.win_rate}
            />
          ))
        )}
      </section>

      {/* Rating history */}
      <section className="adv-section">
        <h3 className="adv-section-title">Rating History</h3>
        <RatingGraph history={data.rating_history} />
      </section>
    </div>
  );
}

export default AdvancedStats;
