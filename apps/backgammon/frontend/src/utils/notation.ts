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
 * A single move parsed out of a notation string. Points are the same internal
 * 1..24 convention used by the engine; `from` / `to` are `"bar"` or `"off"`
 * for off-board sources / destinations.
 */
export interface ParsedMove {
  from: number | "bar";
  to: number | "off";
  is_hit: boolean;
}

/**
 * Parse a full move notation like ``"13/11 13/10"`` or ``"24/22 22/18"``
 * into a list of source/destination pairs. Consecutive segments that share
 * an endpoint (e.g. ``24/22 22/18``) are consolidated so the caller sees the
 * checker's true start and end points (``{ from: 24, to: 18 }``).
 *
 * Unparseable segments are dropped silently — this is a presentation helper,
 * not a validator.
 */
export function parseMovesNotation(notation: string): ParsedMove[] {
  if (!notation) return [];
  const results: ParsedMove[] = [];
  for (const rawSegment of notation.trim().split(/\s+/)) {
    const clean = rawSegment.replace(/\*$/, "");
    const isHit = rawSegment.endsWith("*");
    const [fromStr, toStr] = clean.split("/");
    if (!fromStr || !toStr) continue;
    const from: number | "bar" =
      fromStr === "bar" ? "bar" : parseInt(fromStr, 10);
    const to: number | "off" = toStr === "off" ? "off" : parseInt(toStr, 10);
    if (typeof from === "number" && Number.isNaN(from)) continue;
    if (typeof to === "number" && Number.isNaN(to)) continue;

    // Consolidate chained hops: if the previous destination matches this
    // source, they represent the same checker continuing its journey.
    const prev = results[results.length - 1];
    if (
      prev &&
      typeof from === "number" &&
      prev.to === from
    ) {
      prev.to = to;
      prev.is_hit = prev.is_hit || isHit;
      continue;
    }
    results.push({ from, to, is_hit: isHit });
  }
  return results;
}

/**
 * Like {@link parseMovesNotation} but does NOT consolidate chained hops.
 * ``"24/22 22/18"`` yields two entries: ``{from:24, to:22}`` and
 * ``{from:22, to:18}``.  Useful when each individual die use should be
 * visualised separately (e.g. one arrow per die).
 */
export function parseMovesNotationRaw(notation: string): ParsedMove[] {
  if (!notation) return [];
  const results: ParsedMove[] = [];
  for (const rawSegment of notation.trim().split(/\s+/)) {
    const clean = rawSegment.replace(/\*$/, "");
    const isHit = rawSegment.endsWith("*");
    const [fromStr, toStr] = clean.split("/");
    if (!fromStr || !toStr) continue;
    const from: number | "bar" =
      fromStr === "bar" ? "bar" : parseInt(fromStr, 10);
    const to: number | "off" = toStr === "off" ? "off" : parseInt(toStr, 10);
    if (typeof from === "number" && Number.isNaN(from)) continue;
    if (typeof to === "number" && Number.isNaN(to)) continue;
    results.push({ from, to, is_hit: isHit });
  }
  return results;
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
