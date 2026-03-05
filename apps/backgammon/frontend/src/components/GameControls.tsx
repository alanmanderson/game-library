import { useMemo } from "react";
import type { GameState, Color } from "../types/game";
import "./styles/GameControls.css";

interface GameControlsProps {
  gameState: GameState;
  myColor: Color;
  onRollDice: () => void;
  onEndTurn: () => void;
}

function GameControls({ gameState, myColor, onRollDice, onEndTurn }: GameControlsProps) {
  const isMyTurn = gameState.current_turn === myColor;

  const statusInfo = useMemo(() => {
    if (gameState.status === "waiting") {
      return {
        className: "waiting",
        text: "Waiting for opponent to join...",
      };
    }

    if (gameState.status === "finished") {
      if (gameState.winner === myColor) {
        return { className: "finished", text: "You won!" };
      }
      return { className: "finished", text: "You lost." };
    }

    if (isMyTurn) {
      return { className: "your-turn", text: "Your turn" };
    }
    return { className: "opponent-turn", text: "Opponent's turn" };
  }, [gameState.status, gameState.winner, isMyTurn, myColor]);

  const showRollButton =
    isMyTurn && gameState.status === "rolling";

  const showEndTurnButton =
    isMyTurn &&
    gameState.status === "moving" &&
    gameState.valid_moves.length === 0 &&
    gameState.remaining_dice.length > 0;

  const statusMessage = useMemo(() => {
    if (gameState.status === "waiting") {
      return "Share the table ID with a friend so they can join.";
    }
    if (gameState.status === "finished") {
      const winType = gameState.win_type;
      if (winType && winType !== "normal") {
        return `Won by ${winType}!`;
      }
      return null;
    }
    if (isMyTurn && gameState.status === "rolling") {
      return "Roll the dice to begin your turn.";
    }
    if (isMyTurn && gameState.status === "moving") {
      if (gameState.valid_moves.length === 0) {
        return "No valid moves available.";
      }
      return "Click a highlighted checker, then click its destination.";
    }
    if (!isMyTurn) {
      return "Waiting for opponent to move...";
    }
    return null;
  }, [gameState, isMyTurn]);

  return (
    <div className="game-controls">
      <div className={`turn-indicator ${statusInfo.className}`}>
        {statusInfo.text}
      </div>

      {showRollButton && (
        <button className="roll-btn" onClick={onRollDice}>
          Roll Dice
        </button>
      )}

      {showEndTurnButton && (
        <button className="end-turn-btn" onClick={onEndTurn}>
          End Turn
        </button>
      )}

      {statusMessage && (
        <div className="game-status-msg">{statusMessage}</div>
      )}
    </div>
  );
}

export default GameControls;
