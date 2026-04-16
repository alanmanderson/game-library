import { useEffect } from "react";
import styles from "./AchievementToast.module.css";

export interface Achievement {
  name: string;
  description: string;
  rarity: "COMMON" | "RARE" | "EPIC" | "LEGENDARY";
}

interface Props {
  achievements: Achievement[];
  onDismiss: () => void;
}

const RARITY_COLORS: Record<Achievement["rarity"], string> = {
  COMMON: "var(--color-text-muted)",
  RARE: "#1E5FB3",
  EPIC: "var(--color-accent)",
  LEGENDARY: "#9B3FC8",
};

export function AchievementToast({ achievements, onDismiss }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={styles.container} role="status" aria-live="polite" aria-label="Achievements unlocked">
      {achievements.map((a, i) => (
        <div key={i} className={styles.card}>
          <div className={styles.topRow}>
            <span className={styles.name}>{a.name}</span>
            <span
              className={styles.rarity}
              style={{ color: RARITY_COLORS[a.rarity] }}
            >
              {a.rarity}
            </span>
          </div>
          <p className={styles.description}>{a.description}</p>
        </div>
      ))}
    </div>
  );
}
