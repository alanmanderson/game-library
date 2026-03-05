/**
 * Backgammon notation utilities.
 *
 * Provides helpers for converting internal move representations into the
 * human-readable notation used in game UIs and move-history logs.
 */

import type { Move, Color } from "../types/game";

/**
 * Convert a {@link Move} into standard backgammon notation.
 *
 * Examples:
 *  - `bar/22`  – entering from the bar to point 22
 *  - `6/off`   – bearing off from point 6
 *  - `13/7*`   – moving from 13 to 7 and hitting an opponent's checker
 *  - `13/7`    – a regular (non-hitting) move
 *
 * The `color` parameter is used to disambiguate bar / off points:
 *  - Black uses point 0 as its bar and point 25 as its bearing-off target.
 *  - White uses point 25 as its bar and point 0 as its bearing-off target.
 */
export function moveToNotation(move: Move, color: Color): string {
  let from: string;
  let to: string;

  // Determine the "from" label.
  if (move.from_point === 0 || move.from_point === 25) {
    from = "bar";
  } else {
    from = move.from_point.toString();
  }

  // Determine the "to" label.
  if (move.to_point === 0 || move.to_point === 25) {
    to = "off";
  } else {
    to = move.to_point.toString();
  }

  return `${from}/${to}${move.is_hit ? "*" : ""}`;
}

/**
 * Format a pair of dice values as the conventional dash-separated string
 * (e.g. `"3-5"`).
 */
export function formatDiceRoll(die1: number, die2: number): string {
  return `${die1}-${die2}`;
}

/**
 * Translate an internal point number (1-24) into the display number the
 * player actually sees, which depends on which side of the board they are
 * sitting on.
 *
 * - **White's perspective**: point 1 is bottom-right, point 24 is top-right.
 *   The display number equals the internal number.
 * - **Black's perspective**: the board is mirrored, so internal point 1
 *   appears as 24 on screen and vice-versa.
 */
export function pointToDisplayNumber(
  point: number,
  perspective: Color,
): number {
  if (perspective === "white") return point;
  return 25 - point;
}
