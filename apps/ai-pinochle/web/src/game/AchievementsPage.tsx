import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.tsx";
import { getAuth, ApiError } from "../api/client.ts";
import { Button } from "../ui";
import styles from "./AchievementsPage.module.css";

type Rarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY";

interface AchievementRecord {
  achievement_key: string;
  name: string;
  description: string;
  rarity: Rarity;
  game_id: string | null;
  unlocked_at: string;
}

interface CatalogEntry {
  key: string;
  name: string;
  description: string;
  rarity: Rarity;
}

interface AchievementsResponse {
  total: number;
  achievements: AchievementRecord[];
  catalog: CatalogEntry[];
}

interface Props {
  onBack: () => void;
}

const RARITY_COLORS: Record<Rarity, string> = {
  COMMON: "var(--color-text-muted)",
  RARE: "#1E5FB3",
  EPIC: "var(--color-accent)",
  LEGENDARY: "#9B3FC8",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function AchievementsPage({ onBack }: Props) {
  const { token } = useAuth();
  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getAuth<AchievementsResponse>(
          "/users/me/achievements",
          token!,
        );
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.detail : "Failed to load achievements",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token]);

  const unlockedCount = data?.achievements.length ?? 0;
  const catalogCount = data?.catalog.length ?? 0;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Button variant="secondary" size="sm" onClick={onBack}>
          Back
        </Button>
        <h2>Achievements</h2>
        {data && (
          <span className={styles.count}>
            {unlockedCount} / {catalogCount} unlocked
          </span>
        )}
      </div>

      {loading && <p className={styles.loading}>Loading...</p>}
      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && data && data.catalog.length === 0 && (
        <p className={styles.empty}>No achievements available yet.</p>
      )}

      {!loading && !error && data && data.catalog.length > 0 && (
        <div className={styles.grid}>
          {data.catalog.map((entry) => {
            const unlocked = data.achievements.find(
              (a) => a.achievement_key === entry.key,
            );
            return (
              <div
                key={entry.key}
                className={`${styles.card} ${unlocked ? styles.cardUnlocked : styles.cardLocked}`}
              >
                <div className={styles.cardTop}>
                  <span className={styles.achievementName}>{entry.name}</span>
                  <span
                    className={styles.rarity}
                    style={{ color: RARITY_COLORS[entry.rarity] }}
                  >
                    {entry.rarity}
                  </span>
                </div>
                <p className={styles.description}>{entry.description}</p>
                <p className={unlocked ? styles.unlockedAt : styles.locked}>
                  {unlocked ? `Unlocked ${formatDate(unlocked.unlocked_at)}` : "Locked"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
