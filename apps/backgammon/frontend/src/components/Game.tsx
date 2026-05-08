import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { Color } from "../types/game";
import { BOT_PLAYER_ID, AUTO_MOVE_KEY, HINTS_ENABLED_KEY } from "../constants";
import { useGameState } from "../hooks/useGameState";
import { useGameKeyboard } from "../hooks/useGameKeyboard";
import Board from "./Board";
import { parseMovesNotationRaw } from "../utils/notation";
import Dice from "./Dice";
import GameControls from "./GameControls";
import GameInfo from "./GameInfo";
import GameOverBanner from "./GameOverBanner";
import WaitingState from "./WaitingState";
import PlayerInfoRow from "./PlayerInfoRow";
import ConnectionBanners from "./ConnectionBanners";
import ShortcutHelpModal from "./ShortcutHelpModal";
import ChatPanel from "./ChatPanel";
import "./styles/Game.css";
import { inferDie, findPreferredMove } from "../utils/moveHelpers";

/* -- Inline SVG icons (kept local; no new dependency) --------------------- */
const GearSvg = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M11.078 0l.855 3.424a7.28 7.28 0 011.804 1.042l3.358-1.052 1.078 1.867-2.5 2.375a7.4 7.4 0 010 2.088l2.5 2.375-1.078 1.867-3.358-1.052a7.28 7.28 0 01-1.804 1.042L11.078 18H8.922l-.855-3.424a7.28 7.28 0 01-1.804-1.042L2.905 14.586l-1.078-1.867 2.5-2.375a7.4 7.4 0 010-2.088L1.827 5.88l1.078-1.867 3.358 1.052A7.28 7.28 0 018.067 4.024L8.922 0h2.156zM10 6.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/>
  </svg>
);
const HelpSvg = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M10 0a10 10 0 100 20 10 10 0 000-20zm0 1.6a8.4 8.4 0 110 16.8 8.4 8.4 0 010-16.8zm.05 11.05c-.62 0-1.05.42-1.05 1.05 0 .62.43 1.05 1.05 1.05.61 0 1.05-.43 1.05-1.05 0-.63-.44-1.05-1.05-1.05zM10 4.2c-1.92 0-3.25 1.13-3.4 2.86l-.01.18h1.7c0-.93.65-1.55 1.66-1.55 1 0 1.66.55 1.66 1.4 0 .65-.27 1-1.13 1.5-1 .58-1.42 1.18-1.36 2.18l.01.5h1.66v-.4c0-.65.25-.97 1.13-1.5 1-.6 1.5-1.32 1.5-2.36 0-1.7-1.4-2.81-3.42-2.81z"/>
  </svg>
);
const HomeSvg = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path d="M10 1.2L0.6 9.2l1.4 1.65L3 10.05V18a1 1 0 0 0 1 1h3.5v-5.5h5V19H16a1 1 0 0 0 1-1v-7.95l1 0.8 1.4-1.65L10 1.2z"/>
  </svg>
);
const CopySvg = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <rect x="6" y="6" width="11" height="11" rx="1.8"/>
    <path d="M13 6V4.2A1.2 1.2 0 0 0 11.8 3H4.2A1.2 1.2 0 0 0 3 4.2v7.6A1.2 1.2 0 0 0 4.2 13H6"/>
  </svg>
);
const CheckSvg = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 10.5l4 4 8-9"/>
  </svg>
);

function Game() {
  const { tableId } = useParams<{ tableId: string }>();
  const [copied, setCopied] = useState(false);
  const [moveHistoryOpen, setMoveHistoryOpen] = useState(false);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [resignMenuOpen, setResignMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoMoveEnabled, setAutoMoveEnabled] = useState(() => {
    try { return localStorage.getItem(AUTO_MOVE_KEY) === "true"; } catch { return false; }
  });
  const [hintsEnabled, setHintsEnabled] = useState(() => {
    try { return localStorage.getItem(HINTS_ENABLED_KEY) !== "false"; } catch { return true; }
  });
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsRef = useRef<HTMLDivElement>(null);

  const {
    playerId, gameState, myColor, table, selectedPoint, setSelectedPoint,
    error, waitingForOpponent, opponentConnected, opponentReconnected,
    isConnected, animatingMove, whiteTimeMs, blackTimeMs, timeControl, actions,
    hintMoves, hintsRemaining, chatMessages, diceOrder, swapDice, moveInFlight,
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
  const noOffer = !gameState?.double_offered && !gameState?.resign_offered;
  const showResignButton = isMyTurn && gameState?.status === "rolling" && noOffer;

  // Show yellow arrows for the opponent's most recent move while we're about
  // to roll. Clears once the dice are rolled (status → "moving").
  const previousMoveArrows = useMemo(() => {
    if (!gameState) return undefined;
    if (gameState.status !== "rolling") return undefined;
    if (!gameState.last_turn_notation) return undefined;
    if (gameState.last_turn_color === myColor) return undefined;
    const arrows = parseMovesNotationRaw(gameState.last_turn_notation);
    return arrows.length > 0 ? arrows : undefined;
  }, [gameState, myColor]);
  const diceColor = useMemo((): Color => {
    if (!gameState) return "white";
    if (gameState.status === "rolling" && gameState.dice) {
      return gameState.current_turn === "white" ? "black" : "white";
    }
    return gameState.current_turn;
  }, [gameState]);

  const handlePointClick = useCallback(
    (point: number) => {
      if (!isMyTurn || !isMovingPhase || !myColor || !gameState || moveInFlight) return;
      const movesFromPoint = validMoves.filter((m) => m.from_point === point);
      if (movesFromPoint.length === 0) return;
      const move = findPreferredMove(movesFromPoint, diceOrder, gameState.remaining_dice, myColor);
      if (move) actions.makeMove(move.from_point, move.to_point);
    },
    [isMyTurn, isMovingPhase, myColor, gameState, validMoves, diceOrder, actions, moveInFlight],
  );

  const handleBarClick = useCallback(() => {
    if (!isMyTurn || !isMovingPhase || !myColor || !gameState || moveInFlight) return;
    const barPoint = myColor === "white" ? 25 : 0;
    const movesFromBar = validMoves.filter((m) => m.from_point === barPoint);
    if (movesFromBar.length === 0) return;
    const move = findPreferredMove(movesFromBar, diceOrder, gameState.remaining_dice, myColor);
    if (move) actions.makeMove(move.from_point, move.to_point);
  }, [isMyTurn, isMovingPhase, myColor, gameState, validMoves, diceOrder, actions, moveInFlight]);

  const handleBearOffClick = useCallback(() => {
    // Bear-off is handled by clicking the checker directly in the new one-click mechanic.
  }, []);

  const toggleAutoMove = useCallback(() => {
    setAutoMoveEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(AUTO_MOVE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const toggleHints = useCallback(() => {
    setHintsEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(HINTS_ENABLED_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  // Close settings menu when clicking outside
  useEffect(() => {
    if (!settingsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [settingsOpen]);

  // Auto-move: when there are 0 or 1 valid moves before the player has moved any
  // checkers, execute automatically. Once the player has moved a checker
  // (turn_moves_count > 0), never auto-move — let them review and confirm.
  useEffect(() => {
    if (!autoMoveEnabled || !isMyTurn || !isMovingPhase || !gameState || moveInFlight) return;
    if (gameState.turn_moves_count > 0) return;

    if (gameState.valid_moves.length === 0) {
      // No valid moves at all — auto-end turn (forced pass)
      const timer = setTimeout(() => {
        actions.endTurn();
      }, 500);
      return () => clearTimeout(timer);
    }

    if (gameState.valid_moves.length === 1) {
      // Exactly one valid move — play it automatically
      const move = gameState.valid_moves[0];
      const timer = setTimeout(() => {
        actions.makeMove(move.from_point, move.to_point);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoMoveEnabled, isMyTurn, isMovingPhase, gameState, moveInFlight, actions]);

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
      return "Click a highlighted checker to move it. Click the dice to swap their order.";
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

  if (!gameState || !myColor || !table) {
    return (
      <WaitingState
        tableId={tableId}
        isConnected={isConnected}
        waitingForOpponent={waitingForOpponent}
      />
    );
  }

  return (
    <div className="game-page">
      <div className="game-header">
        <div className="game-header-left">
          <h2>
            Backgammon{" "}
            <span className="header-table-id">
              ({table.id}
              <button
                className="header-copy-btn"
                onClick={handleCopy}
                title={copied ? "Copied!" : "Copy table id"}
                aria-label={copied ? "Copied" : "Copy table id"}
              >
                {copied ? <CheckSvg /> : <CopySvg />}
              </button>
              )
            </span>
          </h2>
        </div>

        {statusMessage && <div className="game-status-msg">{statusMessage}</div>}

        <div className="header-controls">
          <div className="settings-wrapper" ref={settingsRef}>
            <button
              className="hc-btn"
              onClick={() => setSettingsOpen((p) => !p)}
              title="Game settings"
              aria-label="Game settings"
            >
              <GearSvg />
            </button>
            {settingsOpen && (
              <div className="settings-menu">
                <label className="settings-toggle">
                  <span>Auto-move</span>
                  <input type="checkbox" checked={autoMoveEnabled} onChange={toggleAutoMove} />
                  <span className="toggle-slider" />
                </label>
                <p className="settings-hint">Automatically play forced moves</p>
                <div className="menu-divider" />
                <label className="settings-toggle">
                  <span>Show hints</span>
                  <input type="checkbox" checked={hintsEnabled} onChange={toggleHints} />
                  <span className="toggle-slider" />
                </label>
                <p className="settings-hint" style={{ marginBottom: 0 }}>
                  {hintsEnabled ? "Hint button shown during your turn" : "Hint button hidden — focus mode"}
                </p>
              </div>
            )}
          </div>
          <button
            className="hc-btn"
            onClick={() => setShowShortcutHelp(true)}
            title="Keyboard shortcuts (?)"
            aria-label="Show keyboard shortcuts"
          >
            <HelpSvg />
          </button>
          <Link to="/" className="hc-btn hc-btn--home" title="Home" aria-label="Home">
            <HomeSvg />
          </Link>
        </div>
      </div>

      <ConnectionBanners isBotGame={isBotGame} opponentConnected={opponentConnected} opponentReconnected={opponentReconnected} opponentName={opponentName} error={error} spectatorCount={table.spectator_count ?? 0} />

      <div className="game-layout">
        <div className="game-center">
          <PlayerInfoRow name={opponentName} player={opponentPlayer} pips={opponentPips} isOpponent={true} isConnected={opponentConnected} isBotGame={isBotGame} botDifficulty={table.bot_difficulty} isTimed={isTimed} timeMs={opponentTimeMs} isClockActive={!isMyTurn && gameState.status !== "finished"} matchPoints={table.match_points} matchScore={opponentScore} isCrawfordGame={gameState.is_crawford_game} formatClock={formatClock} getClockClass={getClockClass} />

          <div className={`board-area perspective-${myColor}`}>
            <Board gameState={gameState} myColor={myColor} selectedPoint={selectedPoint} validMoves={isMyTurn ? validMoves : []} onPointClick={handlePointClick} onBarClick={handleBarClick} onBearOffClick={handleBearOffClick} cubeValue={gameState.cube_value} cubeOwner={gameState.cube_owner} animatingMove={animatingMove} hintMoves={hintMoves} moveArrows={previousMoveArrows} arrowsMoverColor={gameState.last_turn_color as Color | undefined} boardTheme={myPlayer?.board_theme} checkerStyle={myPlayer?.checker_style} />
            <div className="board-overlay">
              <Dice dice={gameState.dice} remainingDice={gameState.remaining_dice} currentTurn={diceColor} openingRoll={gameState.opening_roll} diceOrder={isMyTurn && isMovingPhase ? diceOrder : undefined} onSwap={isMyTurn && isMovingPhase ? swapDice : undefined} />
              <GameControls gameState={gameState} myColor={myColor} opponentName={opponentName} onRollDice={actions.rollDice} onEndTurn={actions.endTurn} onUndoTurn={actions.undoTurn} onOfferDouble={actions.offerDouble} onAcceptDouble={actions.acceptDouble} onDeclineDouble={actions.declineDouble} onRequestHint={actions.requestHint} onAcceptResign={actions.acceptResign} onRejectResign={actions.rejectResign} hintsRemaining={hintsRemaining} hintsEnabled={hintsEnabled} />
            </div>
            {(gameState.status === "finished" || table.status === "game_over") && (
              <GameOverBanner gameState={gameState} table={table} tableId={tableId!} myColor={myColor} myName={myName} opponentName={opponentName} myScore={myScore} opponentScore={opponentScore} onNextGame={actions.nextGame} />
            )}
          </div>

          <PlayerInfoRow name={myName} player={myPlayer} pips={myPips} isOpponent={false} isConnected={true} isBotGame={isBotGame} isTimed={isTimed} timeMs={myTimeMs} isClockActive={isMyTurn && gameState.status !== "finished"} matchPoints={table.match_points} matchScore={myScore} formatClock={formatClock} getClockClass={getClockClass} />

          {showResignButton && (
            <div className="resign-section">
              {resignMenuOpen ? (
                <div className="resign-type-menu">
                  <span className="resign-type-label">Resign:</span>
                  <button className="resign-type-btn" onClick={() => { actions.offerResign("normal"); setResignMenuOpen(false); }}>Game</button>
                  <button className="resign-type-btn resign-type-gammon" onClick={() => { actions.offerResign("gammon"); setResignMenuOpen(false); }}>Gammon</button>
                  <button className="resign-type-btn resign-type-backgammon" onClick={() => { actions.offerResign("backgammon"); setResignMenuOpen(false); }}>Backgammon</button>
                  <button className="resign-cancel-btn" onClick={() => setResignMenuOpen(false)}>Cancel</button>
                </div>
              ) : (
                <button className="resign-btn" onClick={() => setResignMenuOpen(true)} title="Resign the current game">Resign</button>
              )}
            </div>
          )}

          <GameInfo table={table} gameStatus={gameState.status} isOpen={moveHistoryOpen} onToggle={() => setMoveHistoryOpen((prev) => !prev)} />
        </div>
      </div>

      {showShortcutHelp && <ShortcutHelpModal onClose={() => setShowShortcutHelp(false)} />}

      <ChatPanel chatMessages={chatMessages} onSendChat={actions.sendChat} playerId={playerId} />
    </div>
  );
}

export default Game;
