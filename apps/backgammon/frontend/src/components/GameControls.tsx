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
  onAcceptResign: () => void;
  onRejectResign: () => void;
  opponentName: string;
  hintsRemaining: number;
  hintsEnabled: boolean;
  isPassAndPlay?: boolean;
  nextPlayerName?: string;
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
  onAcceptResign,
  onRejectResign,
  opponentName,
  hintsRemaining,
  hintsEnabled,
  isPassAndPlay,
  nextPlayerName,
}: GameControlsProps) {
  const isMyTurn = isPassAndPlay || gameState.current_turn === myColor;

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

  const noOffer = !gameState.double_offered && !gameState.resign_offered;

  const showRollButton =
    isMyTurn && gameState.status === "rolling" && noOffer;

  const showDoubleButton =
    gameState.can_double && noOffer;

  const showAcceptDeclineButtons =
    gameState.double_offered && gameState.double_offered_by !== myColor;

  // Accept/reject resignation: when opponent offered a resignation
  const showAcceptRejectResign =
    gameState.resign_offered && gameState.resign_offered_by !== myColor;

  // Waiting for opponent to respond to your resignation
  const showResignWaiting =
    gameState.resign_offered && gameState.resign_offered_by === myColor;

  const showUndoButton = isMyTurn && gameState.can_undo;

  const showConfirmTurnButton =
    isMyTurn &&
    gameState.status === "moving" &&
    gameState.turn_moves_count > 0 &&
    (gameState.remaining_dice.length === 0 || gameState.valid_moves.length === 0);

  // End Turn shows when no valid moves remain and no "confirm" button is shown.
  const showEndTurnButton =
    isMyTurn &&
    gameState.status === "moving" &&
    gameState.valid_moves.length === 0 &&
    gameState.turn_moves_count === 0;

  const showHintButton =
    hintsEnabled &&
    isMyTurn &&
    gameState.status === "moving" &&
    gameState.valid_moves.length > 0;

  const resignTypeLabel = (type: string | null) => {
    if (type === "gammon") return "gammon";
    if (type === "backgammon") return "backgammon";
    return "single game";
  };

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
        {showAcceptRejectResign && (
          <>
            <span className="resign-offer-text">
              {opponentName} offers to resign a {resignTypeLabel(gameState.resign_type)}.
            </span>
            <button className="accept-resign-btn" onClick={onAcceptResign} title="Accept resignation">
              Accept
            </button>
            <button className="reject-resign-btn" onClick={onRejectResign} title="Reject resignation">
              Reject
            </button>
          </>
        )}
        {showResignWaiting && (
          <span className="resign-waiting-text">Waiting for opponent to respond to resignation...</span>
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
            {isPassAndPlay && nextPlayerName
              ? `Confirm \u2014 ${nextPlayerName}'s turn`
              : "Confirm Turn"}
          </button>
        )}
        {showEndTurnButton && (
          <button className="end-turn-btn" onClick={onEndTurn} title="End turn (E)">
            {isPassAndPlay && nextPlayerName
              ? `End Turn \u2014 ${nextPlayerName}'s turn`
              : "End Turn"}
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
