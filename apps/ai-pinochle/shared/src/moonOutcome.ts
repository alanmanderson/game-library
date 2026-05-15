/**
 * Moon-shot outcome detection — pure derivation off `GameState`.
 *
 * "Shoot the moon" is a 1500 bid where the bidding team must take every
 * trick. We watch for two transitions:
 *
 *   - SUCCESS: the bidding team took all 12 tricks of the hand.
 *   - FAIL:    they declared moon but failed to take all 12 tricks.
 *
 * Detection is read off `GameState` directly (no extra reducer plumbing) so
 * any caller — web `MoonCelebration`, mobile `MoonOverlay`, or a future
 * analytics sink — can use the same helper. Caller is responsible for
 * edge-detecting the transition into `HAND_COMPLETE` (e.g. via a `useRef`
 * of the previous outcome) so the celebration fires once per hand.
 */
import type { GameState } from "./gameReducer";

export type MoonOutcome =
  | { kind: "none" }
  | { kind: "success"; team: string }
  | { kind: "fail"; team: string };

const TOTAL_TRICKS = 12;

/**
 * Inspect a `GameState` and report the moon outcome for the just-completed
 * hand. Returns `{ kind: "none" }` unless the hand is complete AND the
 * bidding team declared a moon shot.
 */
export function detectMoonOutcome(state: GameState): MoonOutcome {
  if (state.phase !== "HAND_COMPLETE") return { kind: "none" };
  if (!state.handResult) return { kind: "none" };
  // `meldData.is_shoot_the_moon` is set at MELD_BROADCAST and persists through
  // trick play (only HAND_DEALT clears it via resetPerHand).
  if (!state.meldData?.is_shoot_the_moon) return { kind: "none" };

  const team = state.handResult.bidding_team;
  const taken = state.tricksTaken[team] ?? 0;
  return taken >= TOTAL_TRICKS
    ? { kind: "success", team }
    : { kind: "fail", team };
}
