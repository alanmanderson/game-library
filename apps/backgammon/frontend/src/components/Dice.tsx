import { useMemo } from "react";
import type { Color, DiceRoll } from "../types/game";
import "./styles/Dice.css";

interface DiceProps {
  dice: DiceRoll | null;
  remainingDice: number[];
  currentTurn: Color;
  openingRoll?: { white: number; black: number } | null;
}

/**
 * Mapping of die value (1-6) to which cells in a 3x3 grid should be filled.
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

function DieFace({ value, used, color }: { value: number; used: boolean; color: Color }) {
  const filled = DOT_PATTERNS[value] || [];

  return (
    <div className={`die ${used ? "used" : ""} die-${color}`}>
      <div className="die-dots">
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className={`die-dot ${filled.includes(i) ? "filled" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

function Dice({ dice, remainingDice, currentTurn, openingRoll }: DiceProps) {
  const diceDisplay = useMemo(() => {
    if (!dice) return [];

    const isDoubles = dice.die1 === dice.die2;

    if (isDoubles) {
      // Doubles: 4 dice shown
      const allDice = [dice.die1, dice.die1, dice.die1, dice.die1];
      // Count how many of each value remain
      const remainingCount = remainingDice.filter((d) => d === dice.die1).length;
      return allDice.map((val, idx) => ({
        value: val,
        used: idx >= remainingCount,
        color: currentTurn as Color,
      }));
    }

    // Normal roll: 2 dice
    const remaining1 = remainingDice.includes(dice.die1);
    const remaining2 = remainingDice.includes(dice.die2);

    // If both values are remaining, both are not used.
    // If only one copy of a value remains but both dice have different values,
    // figure out which die was used.
    const die1Used = !remaining1;
    // For die2, check if after accounting for die1, die2 is still remaining
    let die2Used: boolean;
    if (remaining2) {
      // If die1 and die2 are different, straightforward
      die2Used = false;
    } else {
      die2Used = true;
    }

    // When showing the opening roll, color each die by the player who rolled it
    if (openingRoll) {
      const whiteVal = openingRoll.white;
      const blackVal = openingRoll.black;
      if (
        (dice.die1 === whiteVal && dice.die2 === blackVal) ||
        (dice.die1 === blackVal && dice.die2 === whiteVal)
      ) {
        const die1Color: Color = dice.die1 === whiteVal ? "white" : "black";
        const die2Color: Color = dice.die1 === whiteVal ? "black" : "white";
        return [
          { value: dice.die1, used: die1Used, color: die1Color },
          { value: dice.die2, used: die2Used, color: die2Color },
        ];
      }
    }

    return [
      { value: dice.die1, used: die1Used, color: currentTurn as Color },
      { value: dice.die2, used: die2Used, color: currentTurn as Color },
    ];
  }, [dice, remainingDice, currentTurn, openingRoll]);

  if (!dice) {
    return null;
  }

  return (
    <div className="dice-container">
      {diceDisplay.map((d, idx) => (
        <DieFace key={idx} value={d.value} used={d.used} color={d.color} />
      ))}
    </div>
  );
}

export default Dice;
