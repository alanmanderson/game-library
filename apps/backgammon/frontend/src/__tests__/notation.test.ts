/**
 * Tests for the backgammon notation utility functions.
 *
 * Covers moveToNotation, formatDiceRoll, parseMovesNotation,
 * parseMovesNotationRaw, pointToDisplayNumber, and
 * notationToPlayerPerspective with every meaningful combination of
 * color, bar, bearing-off, hit moves, and chain notation.
 */

import { describe, it, expect } from "vitest";
import {
  moveToNotation,
  formatDiceRoll,
  parseMovesNotation,
  parseMovesNotationRaw,
  pointToDisplayNumber,
  notationToPlayerPerspective,
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
// parseMovesNotation
// ---------------------------------------------------------------------------

describe("parseMovesNotation", () => {
  it("parses two independent moves", () => {
    expect(parseMovesNotation("13/11 13/10")).toEqual([
      { from: 13, to: 11, is_hit: false },
      { from: 13, to: 10, is_hit: false },
    ]);
  });

  it("consolidates a chained single-checker hop (space-separated)", () => {
    expect(parseMovesNotation("24/22 22/18")).toEqual([
      { from: 24, to: 18, is_hit: false },
    ]);
  });

  it("consolidates a chain notation segment", () => {
    expect(parseMovesNotation("24/22/18")).toEqual([
      { from: 24, to: 18, is_hit: false },
    ]);
  });

  it("preserves the hit flag on a consolidated chain", () => {
    expect(parseMovesNotation("24/22 22/18*")).toEqual([
      { from: 24, to: 18, is_hit: true },
    ]);
  });

  it("preserves the hit flag on a chain notation segment", () => {
    expect(parseMovesNotation("24/22/18*")).toEqual([
      { from: 24, to: 18, is_hit: true },
    ]);
  });

  it("preserves intermediate hit in chain notation", () => {
    expect(parseMovesNotation("13/7*/4")).toEqual([
      { from: 13, to: 4, is_hit: true },
    ]);
  });

  it("parses bar entries and bear-offs", () => {
    expect(parseMovesNotation("bar/22 5/off")).toEqual([
      { from: "bar", to: 22, is_hit: false },
      { from: 5, to: "off", is_hit: false },
    ]);
  });

  it("returns an empty list for an empty or blank string", () => {
    expect(parseMovesNotation("")).toEqual([]);
    expect(parseMovesNotation("   ")).toEqual([]);
  });

  it("drops malformed segments silently", () => {
    expect(parseMovesNotation("13/11 garbage 6/5")).toEqual([
      { from: 13, to: 11, is_hit: false },
      { from: 6, to: 5, is_hit: false },
    ]);
  });

  it("handles chain with independent move", () => {
    expect(parseMovesNotation("13/7/4 8/5")).toEqual([
      { from: 13, to: 4, is_hit: false },
      { from: 8, to: 5, is_hit: false },
    ]);
  });
});

// ---------------------------------------------------------------------------
// parseMovesNotationRaw
// ---------------------------------------------------------------------------

describe("parseMovesNotationRaw", () => {
  it("does NOT consolidate chained hops (space-separated)", () => {
    expect(parseMovesNotationRaw("24/22 22/18")).toEqual([
      { from: 24, to: 22, is_hit: false },
      { from: 22, to: 18, is_hit: false },
    ]);
  });

  it("expands chain notation into individual steps", () => {
    expect(parseMovesNotationRaw("13/7/4")).toEqual([
      { from: 13, to: 7, is_hit: false },
      { from: 7, to: 4, is_hit: false },
    ]);
  });

  it("expands chain with hit markers per step", () => {
    expect(parseMovesNotationRaw("13/7*/4")).toEqual([
      { from: 13, to: 7, is_hit: true },
      { from: 7, to: 4, is_hit: false },
    ]);
  });

  it("parses independent moves the same as consolidated parser", () => {
    expect(parseMovesNotationRaw("13/11 6/5")).toEqual([
      { from: 13, to: 11, is_hit: false },
      { from: 6, to: 5, is_hit: false },
    ]);
  });

  it("preserves bar and off as strings", () => {
    expect(parseMovesNotationRaw("bar/22 5/off")).toEqual([
      { from: "bar", to: 22, is_hit: false },
      { from: 5, to: "off", is_hit: false },
    ]);
  });

  it("handles chain with bar and off", () => {
    expect(parseMovesNotationRaw("bar/22/18")).toEqual([
      { from: "bar", to: 22, is_hit: false },
      { from: 22, to: 18, is_hit: false },
    ]);
  });

  it("handles chain ending with bear-off", () => {
    expect(parseMovesNotationRaw("6/3/off")).toEqual([
      { from: 6, to: 3, is_hit: false },
      { from: 3, to: "off", is_hit: false },
    ]);
  });

  it("handles chain plus independent move", () => {
    expect(parseMovesNotationRaw("13/7/4 8/5")).toEqual([
      { from: 13, to: 7, is_hit: false },
      { from: 7, to: 4, is_hit: false },
      { from: 8, to: 5, is_hit: false },
    ]);
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

// ---------------------------------------------------------------------------
// notationToPlayerPerspective
// ---------------------------------------------------------------------------

describe("notationToPlayerPerspective", () => {
  it("returns white notation unchanged", () => {
    expect(notationToPlayerPerspective("8/5 6/5", "white")).toBe("8/5 6/5");
  });

  it("mirrors regular black moves", () => {
    // Internal 12->15 = Black's 13->10, Internal 1->4 = Black's 24->21
    expect(notationToPlayerPerspective("12/15 1/4*", "black")).toBe(
      "13/10 24/21*",
    );
  });

  it("preserves bar for black (not mirrored)", () => {
    expect(notationToPlayerPerspective("bar/3", "black")).toBe("bar/22");
  });

  it("preserves off for black (not mirrored)", () => {
    expect(notationToPlayerPerspective("22/off", "black")).toBe("3/off");
  });

  it("preserves bar and off for white", () => {
    expect(notationToPlayerPerspective("bar/22", "white")).toBe("bar/22");
    expect(notationToPlayerPerspective("3/off", "white")).toBe("3/off");
  });

  it("passes through non-move notations unchanged", () => {
    expect(notationToPlayerPerspective("(no moves)", "black")).toBe(
      "(no moves)",
    );
    expect(notationToPlayerPerspective("Doubles => 4", "black")).toBe(
      "Doubles => 4",
    );
    expect(notationToPlayerPerspective("Takes", "black")).toBe("Takes");
  });

  it("handles empty string", () => {
    expect(notationToPlayerPerspective("", "black")).toBe("");
  });

  it("mirrors chain notation for black", () => {
    // Internal 12/15/19 = Black's 13/10/6
    expect(notationToPlayerPerspective("12/15/19", "black")).toBe("13/10/6");
  });

  it("mirrors chain with hit for black", () => {
    expect(notationToPlayerPerspective("12/15*/19", "black")).toBe(
      "13/10*/6",
    );
  });

  it("returns chain notation unchanged for white", () => {
    expect(notationToPlayerPerspective("13/7/4", "white")).toBe("13/7/4");
  });

  it("handles chain with bar and off for black", () => {
    expect(notationToPlayerPerspective("bar/3/7", "black")).toBe("bar/22/18");
    expect(notationToPlayerPerspective("4/2/off", "black")).toBe("21/23/off");
  });
});
