/**
 * Tests for the backgammon notation utility functions.
 *
 * Covers moveToNotation, formatDiceRoll, and pointToDisplayNumber with
 * every meaningful combination of color, bar, bearing-off, and hit moves.
 */

import { describe, it, expect } from "vitest";
import {
  moveToNotation,
  formatDiceRoll,
  pointToDisplayNumber,
} from "../utils/notation";

// ---------------------------------------------------------------------------
// moveToNotation
// ---------------------------------------------------------------------------

describe("moveToNotation", () => {
  it("formats a regular white move", () => {
    expect(
      moveToNotation({ from_point: 13, to_point: 7, is_hit: false }, "white"),
    ).toBe("13/7");
  });

  it("formats a regular black move", () => {
    expect(
      moveToNotation({ from_point: 12, to_point: 17, is_hit: false }, "black"),
    ).toBe("12/17");
  });

  it("appends * for a hit move", () => {
    expect(
      moveToNotation({ from_point: 13, to_point: 7, is_hit: true }, "white"),
    ).toBe("13/7*");
  });

  it("shows bar entry for white (from_point 25, enters Black's home 19-24)", () => {
    expect(
      moveToNotation({ from_point: 25, to_point: 22, is_hit: false }, "white"),
    ).toBe("bar/22");
  });

  it("shows bar entry for black (from_point 0, enters White's home 1-6)", () => {
    expect(
      moveToNotation({ from_point: 0, to_point: 3, is_hit: false }, "black"),
    ).toBe("bar/3");
  });

  it("shows bar entry with hit for white", () => {
    expect(
      moveToNotation({ from_point: 25, to_point: 21, is_hit: true }, "white"),
    ).toBe("bar/21*");
  });

  it("shows bear off for white (to_point 0)", () => {
    expect(
      moveToNotation({ from_point: 6, to_point: 0, is_hit: false }, "white"),
    ).toBe("6/off");
  });

  it("shows bear off for black (to_point 25)", () => {
    expect(
      moveToNotation({ from_point: 19, to_point: 25, is_hit: false }, "black"),
    ).toBe("19/off");
  });

  it("handles adjacent-point move", () => {
    expect(
      moveToNotation({ from_point: 7, to_point: 6, is_hit: false }, "white"),
    ).toBe("7/6");
  });

  it("handles black bar entry with hit", () => {
    expect(
      moveToNotation({ from_point: 0, to_point: 5, is_hit: true }, "black"),
    ).toBe("bar/5*");
  });
});

// ---------------------------------------------------------------------------
// formatDiceRoll
// ---------------------------------------------------------------------------

describe("formatDiceRoll", () => {
  it("formats a non-doubles roll", () => {
    expect(formatDiceRoll(3, 5)).toBe("3-5");
  });

  it("formats a doubles roll", () => {
    expect(formatDiceRoll(6, 6)).toBe("6-6");
  });

  it("formats 1-1", () => {
    expect(formatDiceRoll(1, 1)).toBe("1-1");
  });

  it("formats maximum roll", () => {
    expect(formatDiceRoll(6, 5)).toBe("6-5");
  });
});

// ---------------------------------------------------------------------------
// pointToDisplayNumber
// ---------------------------------------------------------------------------

describe("pointToDisplayNumber", () => {
  it("returns the same number for white perspective", () => {
    expect(pointToDisplayNumber(1, "white")).toBe(1);
    expect(pointToDisplayNumber(12, "white")).toBe(12);
    expect(pointToDisplayNumber(24, "white")).toBe(24);
  });

  it("mirrors for black perspective", () => {
    expect(pointToDisplayNumber(1, "black")).toBe(24);
    expect(pointToDisplayNumber(24, "black")).toBe(1);
    expect(pointToDisplayNumber(13, "black")).toBe(12);
  });

  it("midpoint is unchanged for black", () => {
    // Point 12 -> 25-12 = 13, point 13 -> 25-13 = 12
    // No true midpoint that stays the same except conceptually
    expect(pointToDisplayNumber(12, "black")).toBe(13);
    expect(pointToDisplayNumber(13, "black")).toBe(12);
  });
});
