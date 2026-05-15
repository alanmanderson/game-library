/**
 * Helpers for the one-click move mechanic.
 *
 * `inferDie`          — mirrors the backend's `_die_value_for_move` logic.
 * `findPreferredMove` — picks the move that matches the user's current die preference.
 */

/** Return the die value consumed by a single move. */
export function inferDie(
  move: { from_point: number; to_point: number },
  color: string,
  remainingDice: number[],
): number {
  const { from_point, to_point } = move;
  const isBearOff = (color === "white" && to_point === 0) || (color === "black" && to_point === 25);
  if (isBearOff) {
    const exact = color === "white" ? from_point : 25 - from_point;
    if (remainingDice.includes(exact)) return exact;
    const over = remainingDice.filter((d) => d >= exact);
    return over.length ? Math.min(...over) : exact;
  }
  return Math.abs(to_point - from_point);
}

/** Pick the move that best matches the current dice preference order. */
export function findPreferredMove(
  moves: { from_point: number; to_point: number }[],
  diceOrder: number[],
  remainingDice: number[],
  color: string,
): { from_point: number; to_point: number } | null {
  for (const die of diceOrder) {
    if (!remainingDice.includes(die)) continue;
    const match = moves.find((m) => inferDie(m, color, remainingDice) === die);
    if (match) return match;
  }
  return moves[0] ?? null;
}
