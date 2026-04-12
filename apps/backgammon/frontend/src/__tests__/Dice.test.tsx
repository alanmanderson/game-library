/**
 * Tests for the Dice component.
 *
 * Verifies correct rendering of die faces, dot patterns for values 1-6,
 * used/unused visual state, doubles handling, and empty dice handling.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Dice from "../components/Dice";
import type { Color, DiceRoll } from "../types/game";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Dot patterns matching the component's DOT_PATTERNS constant.
 * Grid positions: 0=TL, 1=TC, 2=TR, 3=ML, 4=MC, 5=MR, 6=BL, 7=BC, 8=BR
 */
const DOT_PATTERNS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function renderDice(
  dice: DiceRoll | null,
  remainingDice: number[] = [],
  currentTurn: Color = "white",
  openingRoll: { white: number; black: number } | null = null,
) {
  return render(
    <Dice
      dice={dice}
      remainingDice={remainingDice}
      currentTurn={currentTurn}
      openingRoll={openingRoll}
    />,
  );
}

// ---------------------------------------------------------------------------
// Null dice
// ---------------------------------------------------------------------------

describe("Dice – null dice", () => {
  it("renders nothing when dice is null", () => {
    const { container } = renderDice(null);
    expect(container.querySelector(".dice-container")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Dot patterns for values 1-6
// ---------------------------------------------------------------------------

describe("Dice – dot patterns", () => {
  for (let value = 1; value <= 6; value++) {
    it(`renders the correct dot pattern for die value ${value}`, () => {
      const dice: DiceRoll = { die1: value, die2: value === 6 ? 1 : value + 1 };
      const remaining = [dice.die1, dice.die2];
      const { container } = renderDice(dice, remaining);

      // Get the first die element
      const dieElements = container.querySelectorAll(".die");
      expect(dieElements.length).toBeGreaterThanOrEqual(2);

      // Check dot pattern on the first die (die1 = value)
      const firstDie = dieElements[0];
      const dots = firstDie.querySelectorAll(".die-dot");
      expect(dots.length).toBe(9); // Always 9 grid cells

      const filledIndices: number[] = [];
      dots.forEach((dot, idx) => {
        if (dot.classList.contains("filled")) {
          filledIndices.push(idx);
        }
      });

      expect(filledIndices).toEqual(DOT_PATTERNS[value]);
    });
  }
});

// ---------------------------------------------------------------------------
// Normal roll (2 dice)
// ---------------------------------------------------------------------------

describe("Dice – normal roll", () => {
  it("renders exactly 2 dice for a non-doubles roll", () => {
    const { container } = renderDice(
      { die1: 3, die2: 5 },
      [3, 5],
    );
    const dieElements = container.querySelectorAll(".die");
    expect(dieElements.length).toBe(2);
  });

  it("marks a die as used when it is not in remainingDice", () => {
    const { container } = renderDice(
      { die1: 3, die2: 5 },
      [5], // die1 (3) was used
    );
    const dieElements = container.querySelectorAll(".die");
    expect(dieElements[0].classList.contains("used")).toBe(true);
    expect(dieElements[1].classList.contains("used")).toBe(false);
  });

  it("marks both dice as unused when both remain", () => {
    const { container } = renderDice(
      { die1: 4, die2: 2 },
      [4, 2],
    );
    const dieElements = container.querySelectorAll(".die");
    expect(dieElements[0].classList.contains("used")).toBe(false);
    expect(dieElements[1].classList.contains("used")).toBe(false);
  });

  it("marks both dice as used when neither remains", () => {
    const { container } = renderDice(
      { die1: 4, die2: 2 },
      [],
    );
    const dieElements = container.querySelectorAll(".die");
    expect(dieElements[0].classList.contains("used")).toBe(true);
    expect(dieElements[1].classList.contains("used")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Doubles roll (4 dice)
// ---------------------------------------------------------------------------

describe("Dice – doubles roll", () => {
  it("renders 4 dice for a doubles roll", () => {
    const { container } = renderDice(
      { die1: 6, die2: 6 },
      [6, 6, 6, 6],
    );
    const dieElements = container.querySelectorAll(".die");
    expect(dieElements.length).toBe(4);
  });

  it("marks the correct number as used when some doubles remain", () => {
    const { container } = renderDice(
      { die1: 3, die2: 3 },
      [3, 3], // 2 used out of 4
    );
    const dieElements = container.querySelectorAll(".die");
    const usedCount = Array.from(dieElements).filter((el) =>
      el.classList.contains("used"),
    ).length;
    expect(usedCount).toBe(2);
  });

  it("marks all 4 as used when none remain", () => {
    const { container } = renderDice(
      { die1: 5, die2: 5 },
      [],
    );
    const dieElements = container.querySelectorAll(".die");
    const usedCount = Array.from(dieElements).filter((el) =>
      el.classList.contains("used"),
    ).length;
    expect(usedCount).toBe(4);
  });

  it("marks none as used when all 4 remain", () => {
    const { container } = renderDice(
      { die1: 2, die2: 2 },
      [2, 2, 2, 2],
    );
    const dieElements = container.querySelectorAll(".die");
    const usedCount = Array.from(dieElements).filter((el) =>
      el.classList.contains("used"),
    ).length;
    expect(usedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Die color
// ---------------------------------------------------------------------------

describe("Dice – color classes", () => {
  it("applies the correct color class for white turn", () => {
    const { container } = renderDice(
      { die1: 1, die2: 2 },
      [1, 2],
      "white",
    );
    const dieElements = container.querySelectorAll(".die");
    expect(dieElements[0].classList.contains("die-white")).toBe(true);
    expect(dieElements[1].classList.contains("die-white")).toBe(true);
  });

  it("applies the correct color class for black turn", () => {
    const { container } = renderDice(
      { die1: 1, die2: 2 },
      [1, 2],
      "black",
    );
    const dieElements = container.querySelectorAll(".die");
    expect(dieElements[0].classList.contains("die-black")).toBe(true);
    expect(dieElements[1].classList.contains("die-black")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Opening roll
// ---------------------------------------------------------------------------

describe("Dice – opening roll", () => {
  it("colors each die by the player who rolled it during opening roll", () => {
    const { container } = renderDice(
      { die1: 4, die2: 2 },
      [4, 2],
      "white",
      { white: 4, black: 2 },
    );
    const dieElements = container.querySelectorAll(".die");
    // die1 (4) was white's roll, die2 (2) was black's roll
    expect(dieElements[0].classList.contains("die-white")).toBe(true);
    expect(dieElements[1].classList.contains("die-black")).toBe(true);
  });
});
