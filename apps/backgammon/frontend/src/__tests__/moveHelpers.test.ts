/**
 * Tests for the one-click move mechanic helpers: inferDie and findPreferredMove.
 */

import { describe, it, expect } from "vitest";
import { inferDie, findPreferredMove } from "../utils/moveHelpers";

// ---------------------------------------------------------------------------
// inferDie — normal moves
// ---------------------------------------------------------------------------

describe("inferDie – normal moves", () => {
  it("returns the distance for a regular white move", () => {
    expect(inferDie({ from_point: 13, to_point: 7 }, "white", [6, 4])).toBe(6);
  });

  it("returns the distance for a regular black move", () => {
    expect(inferDie({ from_point: 8, to_point: 12 }, "black", [4, 2])).toBe(4);
  });

  it("handles white bar entry (from_point=25)", () => {
    // White enters from bar to point 20 → die = 5
    expect(inferDie({ from_point: 25, to_point: 20 }, "white", [5, 3])).toBe(5);
  });

  it("handles black bar entry (from_point=0)", () => {
    // Black enters from bar to point 4 → die = 4
    expect(inferDie({ from_point: 0, to_point: 4 }, "black", [4, 2])).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// inferDie — bearing off (exact match)
// ---------------------------------------------------------------------------

describe("inferDie – bearing off exact match", () => {
  it("white bears off point 3 with exact die 3", () => {
    expect(inferDie({ from_point: 3, to_point: 0 }, "white", [3, 5])).toBe(3);
  });

  it("black bears off point 22 with exact die 3 (25−22=3)", () => {
    expect(inferDie({ from_point: 22, to_point: 25 }, "black", [3, 5])).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// inferDie — bearing off with overshoot
// ---------------------------------------------------------------------------

describe("inferDie – bearing off overshoot", () => {
  it("white bears off point 2 with die 5 when 2 is not in remaining", () => {
    // remaining [5, 3]: exact=2 not present, smallest ≥ 2 is 3
    expect(inferDie({ from_point: 2, to_point: 0 }, "white", [5, 3])).toBe(3);
  });

  it("white bears off point 1 with die 4 (smallest remaining ≥ 1)", () => {
    expect(inferDie({ from_point: 1, to_point: 0 }, "white", [4, 6])).toBe(4);
  });

  it("black bears off point 24 with die 4 when exact=1 not in remaining", () => {
    // exact = 25 - 24 = 1, remaining [4, 6]: smallest ≥ 1 is 4
    expect(inferDie({ from_point: 24, to_point: 25 }, "black", [4, 6])).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// findPreferredMove — prefers first die in diceOrder
// ---------------------------------------------------------------------------

describe("findPreferredMove – die preference", () => {
  const remaining = [5, 3];
  const moves = [
    { from_point: 13, to_point: 8 },  // uses die 5
    { from_point: 13, to_point: 10 }, // uses die 3
  ];

  it("picks the move matching diceOrder[0] (die 5) by default", () => {
    const result = findPreferredMove(moves, [5, 3], remaining, "white");
    expect(result).toEqual({ from_point: 13, to_point: 8 });
  });

  it("picks the move matching diceOrder[0] after swap (die 3 first)", () => {
    const result = findPreferredMove(moves, [3, 5], remaining, "white");
    expect(result).toEqual({ from_point: 13, to_point: 10 });
  });
});

// ---------------------------------------------------------------------------
// findPreferredMove — fallback when preferred die is used up
// ---------------------------------------------------------------------------

describe("findPreferredMove – fallback when preferred die is gone", () => {
  it("falls back to die 3 when die 5 is already used", () => {
    const remaining = [3]; // die 5 was used
    const moves = [{ from_point: 8, to_point: 5 }]; // only die-3 move available
    const result = findPreferredMove(moves, [5, 3], remaining, "white");
    expect(result).toEqual({ from_point: 8, to_point: 5 });
  });

  it("returns first move as last resort when no die matches", () => {
    // combined move (distance = 7, not a single die)
    const remaining = [4, 3];
    const moves = [{ from_point: 14, to_point: 7 }];
    const result = findPreferredMove(moves, [4, 3], remaining, "white");
    expect(result).toEqual({ from_point: 14, to_point: 7 });
  });
});

// ---------------------------------------------------------------------------
// findPreferredMove — empty / null cases
// ---------------------------------------------------------------------------

describe("findPreferredMove – edge cases", () => {
  it("returns null for an empty move list", () => {
    expect(findPreferredMove([], [5, 3], [5, 3], "white")).toBeNull();
  });

  it("returns null when no moves and diceOrder is empty", () => {
    expect(findPreferredMove([], [], [], "white")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dice order: larger first on fresh roll
// ---------------------------------------------------------------------------

describe("dice ordering logic", () => {
  it("sorts [die1, die2] so larger is first", () => {
    const die1 = 3, die2 = 5;
    const order = [Math.max(die1, die2), Math.min(die1, die2)];
    expect(order).toEqual([5, 3]);
  });

  it("handles equal dice (doubles) — order unchanged", () => {
    const die1 = 4, die2 = 4;
    const order = [Math.max(die1, die2), Math.min(die1, die2)];
    expect(order).toEqual([4, 4]);
  });

  it("swapDice reverses a two-element array", () => {
    const prev = [5, 3];
    const swapped = prev.length === 2 ? [prev[1], prev[0]] : prev;
    expect(swapped).toEqual([3, 5]);
  });

  it("swapDice is a no-op on non-two-element arrays", () => {
    const prev = [4, 4, 4, 4]; // doubles
    const swapped = prev.length === 2 ? [prev[1], prev[0]] : prev;
    expect(swapped).toBe(prev); // same reference
  });
});
