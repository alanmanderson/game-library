import { useMemo } from "react";
import type { GameState, Color } from "../types/game";
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

  return (
    <div className="game-controls">
      <div className={`turn-indicator ${statusInfo.className}`}>
        {statusInfo.text}
      </div>

      <div className="controls-row">
        {showAcceptDeclineButtons && (
          <>
            <button className="accept-double-btn" onClick={onAcceptDouble}>
              Accept Double
            </button>
            <button className="decline-double-btn" onClick={onDeclineDouble}>
              Decline Double
            </button>
          </>
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
      </div>
    </div>
  );
}

export default GameControls;
