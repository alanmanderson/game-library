import { useEffect, useState } from "react";
import type { PlayerSeasonHistoryEntry } from "../types/game";
import { getPlayerSeasonHistory } from "../services/api";
import { TIER_COLORS, TIER_ORDER, type Tier } from "../constants/tiers";
import "./styles/SeasonHistory.css";

interface SeasonHistoryProps {
  playerId: string;
}

/** Format an ISO date string as "Mar 1, 2026". */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Return the highest tier across a list of season entries (or null). */
function highestTier(entries: PlayerSeasonHistoryEntry[]): Tier | null {
  let bestIndex = -1;
  for (const entry of entries) {
    const idx = TIER_ORDER.indexOf(entry.tier_final as Tier);
    if (idx > bestIndex) bestIndex = idx;
  }
  return bestIndex >= 0 ? TIER_ORDER[bestIndex] : null;
}

function SeasonHistory({ playerId }: SeasonHistoryProps) {
  const [entries, setEntries] = useState<PlayerSeasonHistoryEntry[] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPlayerSeasonHistory(playerId)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load season history.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (loading) {
    return (
      <section className="season-history">
        <h2 className="season-history-title">Season History</h2>
        <div className="season-history-empty">Loading season history...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="season-history">
        <h2 className="season-history-title">Season History</h2>
        <div className="season-history-empty">{error}</div>
      </section>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <section className="season-history">
        <h2 className="season-history-title">Season History</h2>
        <div className="season-history-empty">
          No season history yet. Play a rated match to start building it.
        </div>
      </section>
    );
  }

  const peak = highestTier(entries);

  return (
    <section className="season-history">
      <div className="season-history-header">
        <h2 className="season-history-title">Season History</h2>
        {peak && (
          <span
            className="season-history-peak"
            style={{ color: TIER_COLORS[peak], borderColor: TIER_COLORS[peak] }}
            title="Highest tier ever achieved"
          >
            Peak tier: {peak}
          </span>
        )}
      </div>

      <div className="season-history-grid">
        {entries.map((e) => {
          const tier = e.tier_final as Tier;
          const color = TIER_COLORS[tier] ?? "var(--accent)";
          const total = e.wins + e.losses;
          const winRate = total > 0 ? Math.round((e.wins / total) * 100) : 0;
          return (
            <article
              key={e.season_id}
              className={`season-card${e.is_active ? " season-card--active" : ""}`}
            >
              <header className="season-card-header">
                <h3 className="season-card-name">{e.season_name}</h3>
                <span
                  className="season-card-tier"
                  style={{ color, borderColor: color }}
                >
                  {tier}
                </span>
              </header>

              <div className="season-card-dates">
                {formatDate(e.start_date)} – {formatDate(e.end_date)}
              </div>

              {e.is_active && (
                <div className="season-card-active-label">
                  Current season (in progress)
                </div>
              )}

              <dl className="season-card-stats">
                <div className="season-card-stat">
                  <dt>End rating</dt>
                  <dd>{e.end_rating}</dd>
                </div>
                <div className="season-card-stat">
                  <dt>Peak rating</dt>
                  <dd>{e.peak_rating}</dd>
                </div>
                <div className="season-card-stat">
                  <dt>Record</dt>
                  <dd>
                    {e.wins}-{e.losses}
                    {total > 0 && (
                      <span className="season-card-meta"> ({winRate}%)</span>
                    )}
                  </dd>
                </div>
                <div className="season-card-stat">
                  <dt>Gammons</dt>
                  <dd>
                    {e.gammons_won}W / {e.gammons_lost}L
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default SeasonHistory;
