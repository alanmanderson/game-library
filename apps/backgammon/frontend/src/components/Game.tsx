import { useState, useCallback, useMemo, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import type { Color } from "../types/game";
import { BOT_PLAYER_ID } from "../constants";
import { useGameState } from "../hooks/useGameState";
import { useGameKeyboard } from "../hooks/useGameKeyboard";
import Board from "./Board";
import Dice from "./Dice";
import GameControls from "./GameControls";
import GameInfo from "./GameInfo";
import WaitingRoom from "./WaitingRoom";
import GameOverBanner from "./GameOverBanner";
import PlayerInfoRow from "./PlayerInfoRow";
import ConnectionBanners from "./ConnectionBanners";
import ShortcutHelpModal from "./ShortcutHelpModal";
import ChatPanel from "./ChatPanel";
import "./styles/Game.css";

function Game() {
  const { tableId } = useParams<{ tableId: string }>();
  const [copied, setCopied] = useState(false);
  const [moveHistoryOpen, setMoveHistoryOpen] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const {
    playerId, gameState, myColor, table, selectedPoint, setSelectedPoint,
    error, waitingForOpponent, opponentConnected, opponentReconnected,
    isConnected, animatingMove, whiteTimeMs, blackTimeMs, timeControl, actions,
    hintMoves, hintsRemaining, chatMessages,
  } = useGameState(tableId);

  useGameKeyboard({
    gameState, myColor, selectedPoint, showShortcutHelp,
    setSelectedPoint, setMoveHistoryOpen, setShowShortcutHelp,
    rollDice: actions.rollDice, endTurn: actions.endTurn,
    undoTurn: actions.undoTurn, offerDouble: actions.offerDouble,
    requestHint: actions.requestHint,
  });

  const isMyTurn = gameState?.current_turn === myColor;
  const isMovingPhase = gameState?.status === "moving";
  const validMoves = gameState?.valid_moves ?? [];
  const diceColor = useMemo((): Color => {
    if (!gameState) return "white";
    if (gameState.status === "rolling" && gameState.dice) {
      return gameState.current_turn === "white" ? "black" : "white";
    }
    return gameState.current_turn;
  }, [gameState]);

  const handlePointClick = useCallback(
    (point: number) => {
      if (!isMyTurn || !isMovingPhase || !myColor) return;
      if (selectedPoint !== null) {
        if (validMoves.some((m) => m.from_point === selectedPoint && m.to_point === point)) { actions.makeMove(selectedPoint, point); return; }
        if (validMoves.some((m) => m.from_point === point)) { setSelectedPoint(point); return; }
        setSelectedPoint(null);
        return;
      }
      if (validMoves.some((m) => m.from_point === point)) setSelectedPoint(point);
    },
    [isMyTurn, isMovingPhase, myColor, selectedPoint, validMoves, actions, setSelectedPoint],
  );

  const handleBarClick = useCallback(() => {
    if (!isMyTurn || !isMovingPhase || !myColor) return;
    const barPoint = myColor === "white" ? 25 : 0;
    if (validMoves.some((m) => m.from_point === barPoint)) setSelectedPoint(barPoint);
  }, [isMyTurn, isMovingPhase, myColor, validMoves, setSelectedPoint]);

  const handleBearOffClick = useCallback(() => {
    if (!isMyTurn || !isMovingPhase || !myColor || selectedPoint === null) return;
    const offPoint = myColor === "white" ? 0 : 25;
    if (validMoves.some((m) => m.from_point === selectedPoint && m.to_point === offPoint)) actions.makeMove(selectedPoint, offPoint);
  }, [isMyTurn, isMovingPhase, myColor, selectedPoint, validMoves, actions]);

  const opponentPlayer = useMemo(() => {
    if (!table || !myColor) return null;
    return myColor === "white" ? table.black_player : table.white_player;
  }, [table, myColor]);

  const myPlayer = useMemo(() => {
    if (!table || !myColor) return null;
    return myColor === "white" ? table.white_player : table.black_player;
  }, [table, myColor]);

  const opponentName = opponentPlayer?.nickname ?? "Opponent";
  const myName = myPlayer?.nickname ?? "You";
  const pipCounts = useMemo(() => {
    if (!gameState) return { white: 0, black: 0 };
    if (gameState.pip_white !== undefined && gameState.pip_black !== undefined) {
      return { white: gameState.pip_white, black: gameState.pip_black };
    }
    let whitePips = 0, blackPips = 0;
    for (let i = 1; i <= 24; i++) {
      const val = gameState.points[i];
      if (val > 0) whitePips += i * val;
      if (val < 0) blackPips += (25 - i) * (-val);
    }
    whitePips += 25 * gameState.bar_white;
    blackPips += 25 * gameState.bar_black;
    return { white: whitePips, black: blackPips };
  }, [gameState]);
  const formatClock = useCallback((ms: number | null): string => {
    if (ms == null) return "";
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, []);
  const getClockClass = useCallback((ms: number | null, isActive: boolean): string => {
    const classes = ["chess-clock"];
    if (isActive) classes.push("clock-active");
    if (ms != null && ms <= 10_000) classes.push("clock-critical");
    else if (ms != null && ms <= 30_000) classes.push("clock-warning");
    return classes.join(" ");
  }, []);
  const isTimed = timeControl !== "unlimited" && whiteTimeMs != null;
  const isBotGame = !!(table && (table.white_player?.id === BOT_PLAYER_ID || table.black_player?.id === BOT_PLAYER_ID));
  const myScore = table && myColor ? (myColor === "white" ? table.white_match_score : table.black_match_score) : 0;
  const opponentScore = table && myColor ? (myColor === "white" ? table.black_match_score : table.white_match_score) : 0;
  const myPips = myColor === "white" ? pipCounts.white : pipCounts.black;
  const opponentPips = myColor === "white" ? pipCounts.black : pipCounts.white;
  const myTimeMs = myColor === "white" ? whiteTimeMs : blackTimeMs;
  const opponentTimeMs = myColor === "white" ? blackTimeMs : whiteTimeMs;
  const handleCopy = useCallback(async () => {
    if (!tableId) return;
    try {
      await navigator.clipboard.writeText(tableId);
      setCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement("input");
      el.value = tableId;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [tableId]);
  const statusMessage = useMemo(() => {
    if (!gameState) return null;
    if (gameState.status === "waiting") return "Share the table ID with a friend so they can join.";
    if (gameState.status === "finished" || table?.status === "game_over") {
      const winType = gameState.win_type;
      if (winType && winType !== "normal") return `Won by ${winType}!`;
      return null;
    }
    if (gameState.double_offered) {
      if (gameState.double_offered_by === myColor) return `Waiting for ${opponentName} to respond to your double...`;
      return `${opponentName} offers to double to ${gameState.cube_value * 2}. Accept or decline?`;
    }
    if (isMyTurn && gameState.status === "rolling") {
      if (gameState.is_crawford_game) return "Crawford Game — no doubling allowed. Roll the dice to begin your turn.";
      if (gameState.can_double) return "Double the stakes or roll the dice to begin your turn.";
      return "Roll the dice to begin your turn.";
    }
    if (isMyTurn && gameState.status === "moving") {
      if (gameState.valid_moves.length === 0 && gameState.turn_moves_count > 0) return "No more valid moves. Confirm your turn.";
      if (gameState.valid_moves.length === 0) return "No valid moves available.";
      if (gameState.remaining_dice.length === 0) return "All dice used. Confirm your turn.";
      return "Click a highlighted checker, then click its destination.";
    }
    if (!isMyTurn) return `Waiting for ${opponentName} to move...`;
    return null;
  }, [gameState, isMyTurn, myColor, opponentName]);

  if (!tableId || !playerId) {
    return (
      <div className="game-page">
        <div className="game-loading">
          <p>Invalid game URL or player not found.</p>
          <Link to="/" className="back-link">Go Home</Link>
        </div>
      </div>
    );
  }

  if (waitingForOpponent && !gameState) {
    return <WaitingRoom tableId={tableId} />;
  }

  if (!gameState || !myColor || !table) {
    return (
      <div className="game-page">
        <div className="game-header">
          <h2>Backgammon</h2>
          <Link to="/" className="back-link">Home</Link>
        </div>
        <div className="game-loading">
          <div className="spinner" />
          <p>{isConnected ? "Loading game..." : "Connecting..."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-page">
      <div className="game-header">
        <div className="game-header-left">
          <h2>
            Backgammon{" "}
            <span className="header-table-id">
              ({table.id}{" "}
              <button className="header-copy-btn" onClick={handleCopy}>{copied ? "Copied!" : "Copy"}</button>
              )
            </span>
          </h2>
        </div>
        {statusMessage && <div className="game-status-msg">{statusMessage}</div>}
        <button className="shortcut-help-btn" onClick={() => setShowShortcutHelp(true)} title="Keyboard shortcuts (?)" aria-label="Show keyboard shortcuts">?</button>
        <Link to="/" className="back-link">Home</Link>
      </div>

      <ConnectionBanners isBotGame={isBotGame} opponentConnected={opponentConnected} opponentReconnected={opponentReconnected} opponentName={opponentName} error={error} spectatorCount={table.spectator_count ?? 0} />

      <div className="game-layout">
        <div className="game-center">
          <PlayerInfoRow name={opponentName} player={opponentPlayer} pips={opponentPips} isOpponent={true} isConnected={opponentConnected} isBotGame={isBotGame} botDifficulty={table.bot_difficulty} isTimed={isTimed} timeMs={opponentTimeMs} isClockActive={!isMyTurn && gameState.status !== "finished"} matchPoints={table.match_points} matchScore={opponentScore} isCrawfordGame={gameState.is_crawford_game} formatClock={formatClock} getClockClass={getClockClass} />

          <div className={`board-area perspective-${myColor}`}>
            <Board gameState={gameState} myColor={myColor} selectedPoint={selectedPoint} validMoves={isMyTurn ? validMoves : []} onPointClick={handlePointClick} onBarClick={handleBarClick} onBearOffClick={handleBearOffClick} cubeValue={gameState.cube_value} cubeOwner={gameState.cube_owner} animatingMove={animatingMove} hintMoves={hintMoves} />
            <div className="board-overlay">
              <Dice dice={gameState.dice} remainingDice={gameState.remaining_dice} currentTurn={diceColor} openingRoll={gameState.opening_roll} />
              <GameControls gameState={gameState} myColor={myColor} opponentName={opponentName} onRollDice={actions.rollDice} onEndTurn={actions.endTurn} onUndoTurn={actions.undoTurn} onOfferDouble={actions.offerDouble} onAcceptDouble={actions.acceptDouble} onDeclineDouble={actions.declineDouble} onRequestHint={actions.requestHint} hintsRemaining={hintsRemaining} />
            </div>
            {(gameState.status === "finished" || table.status === "game_over") && (
              <GameOverBanner gameState={gameState} table={table} myColor={myColor} myName={myName} opponentName={opponentName} myScore={myScore} opponentScore={opponentScore} onNextGame={actions.nextGame} />
            )}
          </div>

          <PlayerInfoRow name={myName} player={myPlayer} pips={myPips} isOpponent={false} isConnected={true} isBotGame={isBotGame} isTimed={isTimed} timeMs={myTimeMs} isClockActive={isMyTurn && gameState.status !== "finished"} matchPoints={table.match_points} matchScore={myScore} formatClock={formatClock} getClockClass={getClockClass} />

          <GameInfo table={table} gameStatus={gameState.status} isOpen={moveHistoryOpen} onToggle={() => setMoveHistoryOpen((prev) => !prev)} />
        </div>
      </div>

      {showShortcutHelp && <ShortcutHelpModal onClose={() => setShowShortcutHelp(false)} />}

      <ChatPanel chatMessages={chatMessages} onSendChat={actions.sendChat} playerId={playerId} />
    </div>
  );
}

export default Game;
