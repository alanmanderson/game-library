import { useEffect } from "react";
import type { GameState, Color } from "../types/game";

interface UseGameKeyboardOptions {
  gameState: GameState | null;
  myColor: Color | null;
  selectedPoint: number | null;
  showShortcutHelp: boolean;
  setSelectedPoint: (point: number | null) => void;
  setMoveHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShowShortcutHelp: (show: boolean) => void;
  rollDice: () => void;
  endTurn: () => void;
  undoTurn: () => void;
  offerDouble: () => void;
  requestHint?: () => void;
  isPassAndPlay?: boolean;
}

export function useGameKeyboard({
  gameState,
  myColor,
  selectedPoint,
  showShortcutHelp,
  setSelectedPoint,
  setMoveHistoryOpen,
  setShowShortcutHelp,
  rollDice,
  endTurn,
  undoTurn,
  offerDouble,
  requestHint,
  isPassAndPlay,
}: UseGameKeyboardOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) return;

      if (showShortcutHelp) {
        if (e.key === "Escape") { e.preventDefault(); setShowShortcutHelp(false); }
        return;
      }
      if (!gameState || !myColor) return;
      const isTurn = isPassAndPlay || gameState.current_turn === myColor;

      switch (e.key) {
        case "r": case "R":
          if (isTurn && gameState.status === "rolling" && !gameState.double_offered) { e.preventDefault(); rollDice(); }
          break;
        case "e": case "E": case "Enter": {
          if (e.key === "Enter" && (target.tagName === "BUTTON" || target.tagName === "A")) break;
          if (isTurn && gameState.status === "moving") {
            const canEnd =
              (gameState.turn_moves_count > 0 && (gameState.remaining_dice.length === 0 || gameState.valid_moves.length === 0)) ||
              (gameState.valid_moves.length === 0 && gameState.remaining_dice.length > 0 && gameState.turn_moves_count === 0);
            if (canEnd) { e.preventDefault(); endTurn(); }
          }
          break;
        }
        case "u": case "U":
          if (isTurn && gameState.can_undo) { e.preventDefault(); undoTurn(); }
          break;
        case "z": case "Z":
          if ((e.ctrlKey || e.metaKey) && isTurn && gameState.can_undo) { e.preventDefault(); undoTurn(); }
          break;
        case "d": case "D":
          if (gameState.can_double && !gameState.double_offered) { e.preventDefault(); offerDouble(); }
          break;
        case "h": case "H":
          if (isTurn && gameState.status === "moving" && gameState.valid_moves.length > 0 && requestHint) { e.preventDefault(); requestHint(); }
          break;
        case "Escape":
          if (selectedPoint !== null) { e.preventDefault(); setSelectedPoint(null); }
          break;
        case "m": case "M":
          e.preventDefault(); setMoveHistoryOpen((prev) => !prev);
          break;
        case "?":
          e.preventDefault(); setShowShortcutHelp(true);
          break;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showShortcutHelp, gameState, myColor, selectedPoint, rollDice, endTurn, undoTurn, offerDouble, requestHint, setSelectedPoint, setMoveHistoryOpen, setShowShortcutHelp, isPassAndPlay]);
}
