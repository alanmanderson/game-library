import { useAudioEnabled } from "../hooks/useAudioEnabled";
import { playSound } from "../audio/sounds";
import styles from "./MuteToggle.module.css";

/**
 * Speaker / mute-speaker icon that flips `audio_enabled` in localStorage.
 * Lives in the `BrandHeader` so it's visible on every page post-login.
 *
 * When the user unmutes, we play a tiny `bid_chime` as confirmation — this
 * also satisfies the autoplay-policy "requires a user gesture" requirement,
 * so subsequent game-driven `playSound` calls are allowed to run.
 */
export function MuteToggle() {
  const [enabled, setEnabled] = useAudioEnabled();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (next) playSound("bid_chime", { gain: 0.6 });
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-label={enabled ? "Mute sound effects" : "Unmute sound effects"}
      aria-pressed={!enabled}
      title={enabled ? "Mute sound" : "Unmute sound"}
    >
      {enabled ? <SpeakerIcon /> : <SpeakerOffIcon />}
    </button>
  );
}

function SpeakerIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}
