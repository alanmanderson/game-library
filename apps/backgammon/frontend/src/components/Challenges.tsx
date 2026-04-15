import { useEffect, useState } from "react";
import type { ChallengeProgress, ChallengesData, Player } from "../types/game";
import { getMyChallenges } from "../services/api";
import "./styles/Challenges.css";

interface ChallengesProps {
  player: Player;
}

/**
 * Renders the authenticated player's active daily and weekly challenges.
 *
 * Guests see a sign-in prompt. Registered players see a grid of challenge
 * cards with a progress bar, completion checkmark, and a subtle pulse on
 * completed cards. Data is fetched once per mount — the tab itself remounts
 * when the Home page switches to it, so revisiting the tab always refreshes.
 */
function Challenges({ player }: ChallengesProps) {
  const [data, setData] = useState<ChallengesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (player.is_guest) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMyChallenges()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load challenges.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [player.is_guest]);

  if (player.is_guest) {
    return (
      <div className="challenges-guest">
        <h3>Sign in to earn rewards</h3>
        <p>Daily and weekly challenges give you points you can flaunt.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="challenges-loading">Loading challenges…</div>;
  }
  if (error) {
    return <div className="challenges-error">{error}</div>;
  }
  if (!data) {
    return null;
  }

  return (
    <div className="challenges-root">
      <div className="challenges-header">
        <div>
          <h2 className="challenges-title">Challenges</h2>
          <p className="challenges-subtitle">
            Complete challenges to earn reward points.
          </p>
        </div>
        <div
          className="challenges-points"
          aria-label={`${data.challenge_points} reward points`}
        >
          <span className="challenges-points-value">{data.challenge_points}</span>
          <span className="challenges-points-label">pts</span>
        </div>
      </div>

      <ChallengeSection title="Daily" items={data.daily} />
      <ChallengeSection title="Weekly" items={data.weekly} />
    </div>
  );
}

interface ChallengeSectionProps {
  title: string;
  items: ChallengeProgress[];
}

function ChallengeSection({ title, items }: ChallengeSectionProps) {
  if (items.length === 0) {
    return (
      <section className="challenges-section">
        <h3 className="challenges-section-title">{title}</h3>
        <p className="challenges-empty">No {title.toLowerCase()} challenges right now.</p>
      </section>
    );
  }
  return (
    <section className="challenges-section">
      <h3 className="challenges-section-title">{title}</h3>
      <ul className="challenges-list">
        {items.map((c) => (
          <ChallengeCard key={c.id} challenge={c} />
        ))}
      </ul>
    </section>
  );
}

interface ChallengeCardProps {
  challenge: ChallengeProgress;
}

function ChallengeCard({ challenge }: ChallengeCardProps) {
  const completed = challenge.completed_at !== null;
  const pct = Math.min(
    100,
    Math.round((challenge.progress / Math.max(1, challenge.target)) * 100),
  );
  return (
    <li
      className={`challenge-card${completed ? " challenge-card--complete" : ""}`}
      data-testid={`challenge-${challenge.id}`}
    >
      <div className="challenge-card-head">
        <span className="challenge-card-name">{challenge.name}</span>
        {completed && (
          <span className="challenge-card-check" aria-label="Completed">
            ✓
          </span>
        )}
      </div>
      <p className="challenge-card-desc">{challenge.description}</p>
      <div
        className="challenge-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={challenge.target}
        aria-valuenow={challenge.progress}
      >
        <div className="challenge-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="challenge-card-foot">
        <span className="challenge-card-progress-text">
          {challenge.progress} / {challenge.target}
        </span>
        <span className="challenge-card-reward">
          +{challenge.reward_points} pts
        </span>
      </div>
    </li>
  );
}

export default Challenges;
