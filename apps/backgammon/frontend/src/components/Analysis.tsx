import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Color, Move, AnalysisPanelTab } from "../types/game";
import { useAnalysisSession } from "../hooks/useAnalysisSession";
import { useAnalysisKeyboard } from "../hooks/useAnalysisKeyboard";
import Board from "./Board";
import AnalysisPanel from "./AnalysisPanel";
import "./styles/Analysis.css";

function Analysis() {
  const { sessionId: urlSessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const session = useAnalysisSession();
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<AnalysisPanelTab>("moves");

  useAnalysisKeyboard({ session, enabled: true });

  // Load session on mount
  useEffect(() => {
    if (urlSessionId && !session.sessionId) {
      session.fetchSession(urlSessionId);
    }
  }, [urlSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMyTurn = session.gameState?.current_turn === session.playerColor;
  const isMoving = session.gameState?.status === "moving";
  const isRolling = session.gameState?.status === "rolling";
  const validMoves = session.gameState?.valid_moves ?? [];
  const isFinished =
    session.gameState?.status === "finished" ||
    session.gameState?.status === "game_over";

  const handlePointClick = useCallback(
    (point: number) => {
      if (!isMyTurn || !isMoving || !session.isLivePosition) return;
      if (selectedPoint !== null) {
        if (
          validMoves.some(
            (m: Move) =>
              m.from_point === selectedPoint && m.to_point === point,
          )
        ) {
          session.makeMove(selectedPoint, point);
          setSelectedPoint(null);
          return;
        }
        if (validMoves.some((m: Move) => m.from_point === point)) {
          setSelectedPoint(point);
          return;
        }
        setSelectedPoint(null);
        return;
      }
      if (validMoves.some((m: Move) => m.from_point === point))
        setSelectedPoint(point);
    },
    [isMyTurn, isMoving, selectedPoint, validMoves, session],
  );

  const handleBarClick = useCallback(() => {
    if (!isMyTurn || !isMoving || !session.isLivePosition) return;
    const barPoint = session.playerColor === "white" ? 25 : 0;
    if (validMoves.some((m: Move) => m.from_point === barPoint)) {
      setSelectedPoint(barPoint);
    }
  }, [isMyTurn, isMoving, session.playerColor, validMoves, session.isLivePosition]);

  const handleBearOffClick = useCallback(() => {
    if (
      !isMyTurn ||
      !isMoving ||
      selectedPoint === null ||
      !session.isLivePosition
    )
      return;
    const bearOffPoint = session.playerColor === "white" ? 0 : 25;
    if (
      validMoves.some(
        (m: Move) =>
          m.from_point === selectedPoint && m.to_point === bearOffPoint,
      )
    ) {
      session.makeMove(selectedPoint, bearOffPoint);
      setSelectedPoint(null);
    }
  }, [isMyTurn, isMoving, selectedPoint, session, validMoves]);

  // Build hint arrows for the board
  const hintArrows = useMemo(() => {
    if (!session.hint?.candidates?.length) return undefined;
    const best = session.hint.candidates[0];
    if (!best?.moves?.length) return undefined;
    return best.moves.map((m: { from_point: number; to_point: number }) => ({
      from: m.from_point,
      to: m.to_point,
      equity: best.equity,
    }));
  }, [session.hint]);

  if (session.loading && !session.gameState) {
    return (
      <div className="analysis__loading">Loading analysis session...</div>
    );
  }

  if (!session.gameState) {
    return (
      <div className="analysis__loading">No game state available</div>
    );
  }

  return (
    <div className="analysis">
      <div className="analysis__header">
        <div className="analysis__header-left">
          <button
            className="analysis__back-btn"
            onClick={() => navigate("/")}
          >
            &larr; Back
          </button>
          <span className="analysis__title">Analysis Mode</span>
          {session.sessionId && (
            <span className="analysis__session-id">
              #{session.sessionId}
            </span>
          )}
        </div>
        <div className="analysis__header-actions">
          {!session.isLivePosition && (
            <button
              className="analysis__btn"
              onClick={session.navigateLast}
            >
              Return to game
            </button>
          )}
        </div>
      </div>

      <div className="analysis__content">
        <div className="analysis__board-area">
          <div className="analysis__board-wrapper">
            <Board
              gameState={session.gameState}
              myColor={session.playerColor}
              selectedPoint={selectedPoint}
              validMoves={session.isLivePosition ? validMoves : []}
              onPointClick={handlePointClick}
              onBarClick={handleBarClick}
              onBearOffClick={handleBearOffClick}
              cubeValue={session.gameState.cube_value}
              cubeOwner={session.gameState.cube_owner}
              hintMoves={hintArrows}
            />
          </div>

          {session.error && (
            <div className="analysis__error">
              {session.error}
              <button
                onClick={session.clearError}
                style={{
                  marginLeft: 8,
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                &#x2715;
              </button>
            </div>
          )}

          {session.isLivePosition && !isFinished && (
            <div className="analysis__game-controls">
              {isRolling && isMyTurn && (
                <button
                  className="analysis__btn analysis__btn--primary"
                  onClick={session.roll}
                >
                  Roll
                </button>
              )}
              {isMoving && isMyTurn && (
                <>
                  <button
                    className="analysis__btn"
                    onClick={session.undoMove}
                  >
                    Undo
                  </button>
                  <button
                    className="analysis__btn analysis__btn--primary"
                    onClick={session.endTurn}
                    disabled={session.loading}
                  >
                    {session.loading ? "Waiting..." : "End Turn"}
                  </button>
                </>
              )}
              {isRolling &&
                isMyTurn &&
                session.gameState.can_double && (
                  <button
                    className="analysis__btn"
                    onClick={session.offerDouble}
                  >
                    Double
                  </button>
                )}
              {session.gameState.double_offered &&
                session.gameState.double_offered_by !==
                  session.playerColor && (
                  <>
                    <button
                      className="analysis__btn analysis__btn--primary"
                      onClick={() => session.respondToDouble(true)}
                    >
                      Take
                    </button>
                    <button
                      className="analysis__btn analysis__btn--danger"
                      onClick={() => session.respondToDouble(false)}
                    >
                      Drop
                    </button>
                  </>
                )}
            </div>
          )}

          {isFinished && (
            <div className="analysis__game-controls">
              <div
                style={{
                  color: "var(--accent)",
                  fontWeight: 600,
                  fontSize: "1rem",
                }}
              >
                Game Over &mdash;{" "}
                {session.gameState.winner === session.playerColor
                  ? "You win!"
                  : "gnubg wins"}
                {session.gameState.win_type &&
                  session.gameState.win_type !== "normal" &&
                  ` (${session.gameState.win_type})`}
              </div>
            </div>
          )}
        </div>

        <AnalysisPanel
          session={session}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    </div>
  );
}

export default Analysis;
