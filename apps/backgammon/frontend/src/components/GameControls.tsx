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
  onRequestHint: () => void;
  opponentName: string;
  hintsRemaining: number;
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
  onRequestHint,
  opponentName,
  hintsRemaining,
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

  const showUndoButton = isMyTurn && gameState.can_undo;

  const showConfirmTurnButton =
    isMyTurn &&
    gameState.status === "moving" &&
    gameState.turn_moves_count > 0 &&
    (gameState.remaining_dice.length === 0 || gameState.valid_moves.length === 0);

  // End Turn shows when no valid moves remain and no "confirm" button is shown.
  // This covers both the normal blocked case (dice still in hand) and the edge
  // case where the server restarted mid-turn and turn_moves_count was reset to 0
  // even though all dice were already used (remaining_dice is empty).
  const showEndTurnButton =
    isMyTurn &&
    gameState.status === "moving" &&
    gameState.valid_moves.length === 0 &&
    gameState.turn_moves_count === 0;

  const showHintButton =
    isMyTurn &&
    gameState.status === "moving" &&
    gameState.valid_moves.length > 0;

  return (
    <div className="game-controls">
      <div className="controls-row">
        {showAcceptDeclineButtons && (
          <>
            <button className="accept-double-btn" onClick={onAcceptDouble} title="Accept double">
              Accept Double
            </button>
            <button className="decline-double-btn" onClick={onDeclineDouble} title="Decline double">
              Decline Double
            </button>
          </>
        )}
        {showDoubleButton && (
          <button className="double-btn" onClick={onOfferDouble} title="Offer double (D)">
            Double
          </button>
        )}
        {showRollButton && (
          <button className="roll-btn" onClick={onRollDice} title="Roll dice (R)">
            Roll
          </button>
        )}
        {showUndoButton && (
          <button className="undo-btn" onClick={onUndoTurn} title="Undo move (U)">
            Undo
          </button>
        )}
        {showConfirmTurnButton && (
          <button className="confirm-turn-btn" onClick={onEndTurn} title="Confirm turn (E)">
            Confirm Turn
          </button>
        )}
        {showEndTurnButton && (
          <button className="end-turn-btn" onClick={onEndTurn} title="End turn (E)">
            End Turn
          </button>
        )}
        {showHintButton && (
          <button
            className="hint-btn"
            onClick={onRequestHint}
            disabled={hintsRemaining <= 0}
            title={hintsRemaining > 0 ? `Get a move suggestion (H) - ${hintsRemaining} left` : "No hints remaining"}
          >
            Hint ({hintsRemaining})
          </button>
        )}
      </div>
    </div>
  );
}

export default GameControls;
