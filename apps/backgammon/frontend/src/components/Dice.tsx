import { useMemo, useState, useEffect, useRef } from "react";
import type { Color, DiceRoll } from "../types/game";
import "./styles/Dice.css";

interface DiceProps {
  dice: DiceRoll | null;
  remainingDice: number[];
  currentTurn: Color;
  openingRoll?: { white: number; black: number } | null;
  /** When true, skip the tumble animation and render the dice statically. */
  animate?: boolean;
  /** Preferred display order [firstDie, secondDie]. When provided, overrides the default die1/die2 order. */
  diceOrder?: number[];
  /** Called when the user clicks the dice to swap their priority order. */
  onSwap?: () => void;
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

function DieFace({ value, used, color, rolling }: { value: number; used: boolean; color: Color; rolling?: boolean }) {
  const filled = DOT_PATTERNS[value] || [];

  return (
    <div className={`die ${used ? "used" : ""} ${rolling ? "rolling" : ""} die-${color}`}>
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

function Dice({ dice, remainingDice, currentTurn, openingRoll, animate = true, diceOrder, onSwap }: DiceProps) {
  const [isRolling, setIsRolling] = useState(false);
  const [rollingFaces, setRollingFaces] = useState<[number, number]>([1, 1]);
  const prevDiceRef = useRef<{ die1: number; die2: number } | null>(null);
  const rollTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const rollIntervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const prev = prevDiceRef.current;

    if (dice) {
      const isNew = !prev || prev.die1 !== dice.die1 || prev.die2 !== dice.die2;
      if (isNew && animate) {
        setIsRolling(true);

        // Cycle random faces during tumble
        if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
        rollIntervalRef.current = setInterval(() => {
          setRollingFaces([
            Math.floor(Math.random() * 6) + 1,
            Math.floor(Math.random() * 6) + 1,
          ]);
        }, 60);

        if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
        rollTimerRef.current = setTimeout(() => {
          if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
          setIsRolling(false);
        }, 500);
      }
      prevDiceRef.current = { die1: dice.die1, die2: dice.die2 };
    } else {
      prevDiceRef.current = null;
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
      setIsRolling(false);
    }
  }, [dice, animate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
      if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
    };
  }, []);

  // Normal (non-rolling) dice display
  const normalDiceDisplay = useMemo(() => {
    if (!dice) return [];

    const isDoubles = dice.die1 === dice.die2;

    if (isDoubles) {
      // Doubles: 4 dice shown — order doesn't matter, all same value
      const allDice = [dice.die1, dice.die1, dice.die1, dice.die1];
      const remainingCount = remainingDice.filter((d) => d === dice.die1).length;
      return allDice.map((val, idx) => ({
        value: val,
        used: idx >= remainingCount,
        color: currentTurn as Color,
      }));
    }

    // Determine display order: use diceOrder prop if provided, otherwise original roll order
    const first = diceOrder && diceOrder.length >= 2 ? diceOrder[0] : dice.die1;
    const second = diceOrder && diceOrder.length >= 2 ? diceOrder[1] : dice.die2;

    const firstUsed = !remainingDice.includes(first);
    const secondUsed = !remainingDice.includes(second);

    // When showing the opening roll, color each die by the player who rolled it
    if (openingRoll) {
      const whiteVal = openingRoll.white;
      const blackVal = openingRoll.black;
      if (
        (dice.die1 === whiteVal && dice.die2 === blackVal) ||
        (dice.die1 === blackVal && dice.die2 === whiteVal)
      ) {
        return [
          { value: first, used: firstUsed, color: (first === whiteVal ? "white" : "black") as Color },
          { value: second, used: secondUsed, color: (second === whiteVal ? "white" : "black") as Color },
        ];
      }
    }

    return [
      { value: first, used: firstUsed, color: currentTurn as Color },
      { value: second, used: secondUsed, color: currentTurn as Color },
    ];
  }, [dice, remainingDice, currentTurn, openingRoll, diceOrder]);

  if (!dice) {
    return null;
  }

  // During rolling animation: show 2 dice with cycling random faces
  if (isRolling) {
    return (
      <div className="dice-container">
        <DieFace value={rollingFaces[0]} used={false} color={currentTurn} rolling={true} />
        <DieFace value={rollingFaces[1]} used={false} color={currentTurn} rolling={true} />
      </div>
    );
  }

  const isSwappable = !!onSwap && dice && dice.die1 !== dice.die2;

  return (
    <div
      className={`dice-container${isSwappable ? " dice-swappable" : ""}`}
      onClick={isSwappable ? onSwap : undefined}
      title={isSwappable ? "Click to swap dice order" : undefined}
      role={isSwappable ? "button" : undefined}
      aria-label={isSwappable ? "Swap dice order" : undefined}
    >
      {normalDiceDisplay.map((d, idx) => (
        <DieFace key={idx} value={d.value} used={d.used} color={d.color} />
      ))}
    </div>
  );
}

export default Dice;
