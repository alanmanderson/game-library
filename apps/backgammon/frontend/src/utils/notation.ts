/**
 * Backgammon notation utilities.
 *
 * Provides helpers for converting internal move representations into the
 * human-readable notation used in game UIs and move-history logs.
 *
 * Supports chain notation where the same checker uses multiple dice:
 *   ``"13/7/4"`` instead of ``"13/7 7/4"``
 */

import type { Move, Color } from "../types/game";

/**
 * Convert a {@link Move} into standard backgammon notation.
 *
 * Examples:
 *  - `bar/22`  -- entering from the bar to point 22
 *  - `6/off`   -- bearing off from point 6
 *  - `13/7*`   -- moving from 13 to 7 and hitting an opponent's checker
 *  - `13/7`    -- a regular (non-hitting) move
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
 * Parse a single whitespace-delimited segment into individual moves.
 *
 * Handles both simple ``"13/7"`` and chain ``"13/7/4"`` segments.
 * Hit markers on intermediate/final points are preserved per-step:
 *   ``"13/7*\/4"`` -> hit on 7, no hit on 4.
 */
function parseSegmentRaw(rawSegment: string): ParsedMove[] {
  const parts = rawSegment.split("/");
  if (parts.length < 2) return [];

  const results: ParsedMove[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    // The "from" part: strip any trailing * (belongs to a prior step's hit)
    const fromClean = parts[i].replace(/\*$/, "");
    // The "to" part: check for trailing * (hit on this landing point)
    const toPart = parts[i + 1];
    const isHit = toPart.endsWith("*");
    const toClean = toPart.replace(/\*$/, "");

    const from: number | "bar" =
      fromClean === "bar" ? "bar" : parseInt(fromClean, 10);
    const to: number | "off" =
      toClean === "off" ? "off" : parseInt(toClean, 10);
    if (typeof from === "number" && Number.isNaN(from)) continue;
    if (typeof to === "number" && Number.isNaN(to)) continue;

    results.push({ from, to, is_hit: isHit });
  }
  return results;
}

/**
 * Parse a full move notation string into a list of source/destination pairs.
 *
 * Supports both space-separated notation (``"13/7 7/4"``) and chain notation
 * (``"13/7/4"``).  Consecutive segments that share an endpoint are
 * consolidated so the caller sees the checker's true start and end points
 * (``{ from: 13, to: 4 }``).
 *
 * Unparseable segments are dropped silently -- this is a presentation helper,
 * not a validator.
 */
export function parseMovesNotation(notation: string): ParsedMove[] {
  if (!notation) return [];
  const results: ParsedMove[] = [];
  for (const rawSegment of notation.trim().split(/\s+/)) {
    for (const move of parseSegmentRaw(rawSegment)) {
      // Consolidate chained hops: if the previous destination matches this
      // source, they represent the same checker continuing its journey.
      const prev = results[results.length - 1];
      if (prev && typeof move.from === "number" && prev.to === move.from) {
        prev.to = move.to;
        prev.is_hit = prev.is_hit || move.is_hit;
        continue;
      }
      results.push({ ...move });
    }
  }
  return results;
}

/**
 * Like {@link parseMovesNotation} but does NOT consolidate chained hops.
 *
 * ``"13/7/4"`` yields two entries: ``{from:13, to:7}`` and
 * ``{from:7, to:4}``.  Useful when each individual die use should be
 * visualised separately (e.g. one arrow per die).
 *
 * Also handles legacy space-separated format: ``"24/22 22/18"`` yields
 * ``{from:24, to:22}`` and ``{from:22, to:18}``.
 */
export function parseMovesNotationRaw(notation: string): ParsedMove[] {
  if (!notation) return [];
  const results: ParsedMove[] = [];
  for (const rawSegment of notation.trim().split(/\s+/)) {
    results.push(...parseSegmentRaw(rawSegment));
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

/**
 * Convert a notation string from internal coordinates to the mover's own
 * perspective.  In standard backgammon each player's moves are expressed so
 * that their home board is points 1-6 and movement goes from higher to
 * lower numbers.
 *
 * For White the internal numbering already matches, so the string is
 * returned unchanged.  For Black, board point numbers (1-24) are mirrored
 * via ``25 - point``.  ``bar`` and ``off`` are left as-is.
 *
 * Handles both simple (``"8/5"``) and chain (``"13/7/4"``) segments.
 *
 * Examples (Black):
 *   ``"12/15/19"``    -> ``"13/10/6"``
 *   ``"bar/3"``       -> ``"bar/22"``
 *   ``"22/off"``      -> ``"3/off"``
 */
export function notationToPlayerPerspective(
  notation: string,
  moverColor: Color,
): string {
  if (moverColor === "white" || !notation) return notation;
  // Non-move entries (cube actions, no-move markers)
  if (notation.startsWith("(") || !notation.includes("/")) return notation;

  return notation
    .split(/\s+/)
    .map((segment) => {
      // Split by "/" to handle chain notation (e.g. "13/7/4" or "13/7*/4")
      const parts = segment.split("/");
      if (parts.length < 2) return segment;

      const converted = parts.map((part) => {
        const hitSuffix = part.endsWith("*") ? "*" : "";
        const clean = part.replace(/\*$/, "");

        if (clean === "bar") return "bar" + hitSuffix;
        if (clean === "off") return "off" + hitSuffix;
        return String(25 - parseInt(clean, 10)) + hitSuffix;
      });

      return converted.join("/");
    })
    .join(" ");
}
