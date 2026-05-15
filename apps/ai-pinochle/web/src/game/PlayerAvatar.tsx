import { memo } from "react";
import styles from "./PlayerAvatar.module.css";

const PALETTE = [
  "#e53935", "#8e24aa", "#3949ab", "#00897b",
  "#43a047", "#f4511e", "#6d4c41", "#546e7a",
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

interface Props {
  username: string;
}

// `username` is a stable string (set when seats fill), so shallow-equal
// React.memo skips the re-render on every unrelated WS event.
export const PlayerAvatar = memo(function PlayerAvatar({ username }: Props) {
  const color = PALETTE[hashCode(username) % PALETTE.length];
  const initial = username.charAt(0).toUpperCase();

  return (
    <div className={styles.wrapper}>
      <div className={styles.circle} style={{ background: color }}>
        {initial}
      </div>
      <p className={styles.name}>{username}</p>
    </div>
  );
});
