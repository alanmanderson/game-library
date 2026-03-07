import { useMemo } from "react";
import type { GameState, Color, Table } from "../types/game";
import "./styles/GameControls.css";

interface GameControlsProps {
  gameState: GameState;
  myColor: Color;
  onRollDice: () => void;
  onEndTurn: () => void;
  onUndoTurn: () => void;
  onOfferDouble: () => void;
  onAcceptDouble: () => void;
  onDeclineDouble: () => void;
  table: Table;
  opponentName: string;
}

function GameControls({
  gameState,
  myColor,
  onRollDice,
  onEndTurn,
  onUndoTurn,
  onOfferDouble,
  onAcceptDouble,
  onDeclineDouble,
  table,
  opponentName,
}: GameControlsProps) {
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
    return { className: "opponent-turn", text: `${opponentName}'s turn` };
  }, [gameState.status, gameState.winner, isMyTurn, myColor, opponentName]);

  const showRollButton =
    isMyTurn && gameState.status === "rolling" && !gameState.double_offered;

  const showDoubleButton =
    gameState.can_double && !gameState.double_offered;

  const showAcceptDeclineButtons =
    gameState.double_offered && gameState.double_offered_by !== myColor;

  const showUndoButton = gameState.can_undo;

  const showConfirmTurnButton =
    isMyTurn &&
    gameState.status === "moving" &&
    gameState.turn_moves_count > 0 &&
    (gameState.remaining_dice.length === 0 || gameState.valid_moves.length === 0);

  const showEndTurnButton =
    isMyTurn &&
    gameState.status === "moving" &&
    gameState.valid_moves.length === 0 &&
    gameState.remaining_dice.length > 0 &&
    gameState.turn_moves_count === 0;

  const myScore = myColor === "white" ? table.white_match_score : table.black_match_score;
  const opponentScore = myColor === "white" ? table.black_match_score : table.white_match_score;

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
    if (gameState.double_offered) {
      if (gameState.double_offered_by === myColor) {
        return `Waiting for ${opponentName} to respond to your double...`;
      }
      return `${opponentName} offers to double the stakes to ${gameState.cube_value * 2}. Accept or decline?`;
    }
    if (isMyTurn && gameState.status === "rolling") {
      if (gameState.can_double) {
        return "Double the stakes or roll the dice to begin your turn.";
      }
      return "Roll the dice to begin your turn.";
    }
    if (isMyTurn && gameState.status === "moving") {
      if (gameState.valid_moves.length === 0 && gameState.turn_moves_count > 0) {
        return "No more valid moves. Confirm your turn.";
      }
      if (gameState.valid_moves.length === 0) {
        return "No valid moves available.";
      }
      if (gameState.remaining_dice.length === 0) {
        return "All dice used. Confirm your turn.";
      }
      return "Click a highlighted checker, then click its destination.";
    }
    if (!isMyTurn) {
      return `Waiting for ${opponentName} to move...`;
    }
    return null;
  }, [gameState, isMyTurn, myColor, opponentName]);

  return (
    <div className="game-controls">
      <div className={`turn-indicator ${statusInfo.className}`}>
        {statusInfo.text}
      </div>

      {table.match_points > 0 && (
        <div className="match-score-display">
          <span className="match-score">
            Score: {myScore} - {opponentScore} (to {table.match_points})
          </span>
        </div>
      )}

      {showAcceptDeclineButtons && (
        <div className="double-response-buttons">
          <button className="accept-double-btn" onClick={onAcceptDouble}>
            Accept Double
          </button>
          <button className="decline-double-btn" onClick={onDeclineDouble}>
            Decline Double
          </button>
        </div>
      )}

      {showDoubleButton && (
        <button className="double-btn" onClick={onOfferDouble}>
          Double
        </button>
      )}

      {showRollButton && (
        <button className="roll-btn" onClick={onRollDice}>
          Roll Dice
        </button>
      )}

      {showUndoButton && (
        <button className="undo-btn" onClick={onUndoTurn}>
          Undo
        </button>
      )}

      {showConfirmTurnButton && (
        <button className="confirm-turn-btn" onClick={onEndTurn}>
          Confirm Turn
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
