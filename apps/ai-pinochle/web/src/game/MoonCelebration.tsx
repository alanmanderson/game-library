import { useEffect, useRef } from "react";
import { confettiPalette } from "@pinochle/shared";
import type { MoonOutcome } from "@pinochle/shared";
import { runConfetti } from "./confetti";
import { useReducedMotion } from "../hooks/useReducedMotion";
import styles from "./MoonCelebration.module.css";

interface Props {
  outcome: Extract<MoonOutcome, { kind: "success" } | { kind: "fail" }>;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4000;

/**
 * Full-screen celebration overlay shown when a hand resolves a moon shot.
 *
 * Auto-dismisses after 4s or on click/keyboard. Confetti is canvas-based
 * (see ./confetti.ts) and is replaced with a static banner when the user
 * has `prefers-reduced-motion: reduce`.
 *
 * Sound is intentionally NOT wired here — see TODO below; issue #1 covers
 * the audio system.
 */
export function MoonCelebration({ outcome, onDismiss }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const isSuccess = outcome.kind === "success";

  // TODO(#1): play moon chime here — success and fail want different cues.
  // Audio system lands in issue #1; the single integration point is this
  // effect so a follow-up only needs to add a `sounds.moonSuccess.play()`
  // (and a fail variant) plus respect a user mute toggle.

  useEffect(() => {
    if (!isSuccess || reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cancel = runConfetti(canvas, confettiPalette);
    return cancel;
  }, [isSuccess, reduced]);

  useEffect(() => {
    const id = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [onDismiss]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onDismiss();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="moon-celebration-title"
      onClick={onDismiss}
    >
      {isSuccess && !reduced && (
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          aria-hidden="true"
        />
      )}
      <div
        className={`${styles.banner} ${isSuccess ? styles.bannerSuccess : styles.bannerFail}`}
      >
        <p className={`${styles.team} ${isSuccess ? "" : styles.teamFail}`}>
          Team {outcome.team}
        </p>
        <h2
          id="moon-celebration-title"
          className={`${styles.title} ${isSuccess ? "" : styles.titleFail}`}
        >
          {isSuccess ? "\uD83C\uDF19 SHOT THE MOON!" : "Moon Shot Failed"}
        </h2>
        <p className={styles.dismiss}>Tap or press Esc to dismiss</p>
      </div>
    </div>
  );
}
