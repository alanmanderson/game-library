import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import type { GameState, Table, WSMessage } from "../types/game";
import { useWebSocket } from "../hooks/useWebSocket";
import { TOKEN_KEY } from "../constants";
import Board from "./Board";
import Dice from "./Dice";
import GameInfo from "./GameInfo";
import "./styles/Game.css";
import "./styles/Spectator.css";

function Spectator() {
  const { tableId } = useParams<{ tableId: string }>();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);

  const [whiteTimeMs, setWhiteTimeMs] = useState<number | null>(null);
  const [blackTimeMs, setBlackTimeMs] = useState<number | null>(null);
  const [timeControl, setTimeControl] = useState<string>("unlimited");
  const lastSyncRef = useRef<number>(Date.now());

  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Build WebSocket URL for spectator endpoint
  const wsUrl = useMemo(() => {
    if (!tableId) return "";
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/${tableId}/spectate?token=${token}`;
  }, [tableId]);

  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case "game_state":
        if (message.data.game_state) {
          setGameState(message.data.game_state);
          const gs = message.data.game_state;
          if (gs.white_time_remaining_ms != null) {
            setWhiteTimeMs(gs.white_time_remaining_ms);
          }
          if (gs.black_time_remaining_ms != null) {
            setBlackTimeMs(gs.black_time_remaining_ms);
          }
          if (gs.time_control) {
            setTimeControl(gs.time_control);
          }
          lastSyncRef.current = Date.now();
        }
        if (message.data.table) {
          setTable(message.data.table);
          const t = message.data.table;
          if (t.white_time_remaining_ms != null) {
            setWhiteTimeMs(t.white_time_remaining_ms);
          }
          if (t.black_time_remaining_ms != null) {
            setBlackTimeMs(t.black_time_remaining_ms);
          }
          if (t.time_control) {
            setTimeControl(t.time_control);
          }
          lastSyncRef.current = Date.now();
        }
        setIsWaiting(false);
        setError(null);
        break;

      case "waiting":
        setIsWaiting(true);
        break;

      case "game_over":
        break;

      case "error":
        setError(message.data.message);
        if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = setTimeout(() => setError(null), 5000);
        break;

      default:
        break;
    }
  }, []);

  const handleWsOpen = useCallback(() => {
    setError(null);
  }, []);

  const { isConnected } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    onOpen: handleWsOpen,
  });

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, []);

  // Client-side countdown timer (display only)
  useEffect(() => {
    if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);

    if (timeControl === "unlimited" || whiteTimeMs == null || blackTimeMs == null) return;
    if (!gameState || gameState.status === "finished" || gameState.status === "waiting") return;

    const isActive = gameState.status === "moving" || gameState.status === "rolling";
    if (!isActive) return;

    clockIntervalRef.current = setInterval(() => {
      if (gameState.current_turn === "white") {
        setWhiteTimeMs((prev) => (prev != null ? Math.max(0, prev - 100) : prev));
      } else {
        setBlackTimeMs((prev) => (prev != null ? Math.max(0, prev - 100) : prev));
      }
    }, 100);

    return () => {
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, [timeControl, gameState?.status, gameState?.current_turn, whiteTimeMs, blackTimeMs]);

  const pipCounts = useMemo(() => {
    if (!gameState) return { white: 0, black: 0 };
    if (gameState.pip_white !== undefined && gameState.pip_black !== undefined) {
      return { white: gameState.pip_white, black: gameState.pip_black };
    }
    let whitePips = 0;
    let blackPips = 0;
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

  const isTimed = timeControl !== "unlimited" && whiteTimeMs != null;

  const getClockClass = useCallback((ms: number | null, isActive: boolean): string => {
    const classes = ["chess-clock"];
    if (isActive) classes.push("clock-active");
    if (ms != null && ms <= 10_000) classes.push("clock-critical");
    else if (ms != null && ms <= 30_000) classes.push("clock-warning");
    return classes.join(" ");
  }, []);

  const diceColor = useMemo(() => {
    if (!gameState) return "white" as const;
    if (gameState.status === "rolling" && gameState.dice) {
      return gameState.current_turn === "white" ? ("black" as const) : ("white" as const);
    }
    return gameState.current_turn;
  }, [gameState]);

  const spectatorCount = table?.spectator_count ?? 0;

  if (!tableId) {
    return (
      <div className="game-page">
        <div className="game-loading">
          <p>Invalid game URL.</p>
          <Link to="/" className="back-link">Go Home</Link>
        </div>
      </div>
    );
  }

  if (isWaiting && !gameState) {
    return (
      <div className="game-page">
        <div className="game-header">
          <h2>Spectating</h2>
          <Link to="/" className="back-link">Home</Link>
        </div>
        <div className="game-loading">
          <div className="spinner" />
          <p>Game hasn't started yet. Waiting...</p>
        </div>
      </div>
    );
  }

  if (!gameState || !table) {
    return (
      <div className="game-page">
        <div className="game-header">
          <h2>Spectating</h2>
          <Link to="/" className="back-link">Home</Link>
        </div>
        <div className="game-loading">
          <div className="spinner" />
          <p>{isConnected ? "Loading game..." : "Connecting..."}</p>
        </div>
      </div>
    );
  }

  const whiteName = table.white_player?.nickname ?? "White";
  const blackName = table.black_player?.nickname ?? "Black";
  const currentTurnName = gameState.current_turn === "white" ? whiteName : blackName;

  return (
    <div className="game-page">
      <div className="game-header">
        <div className="game-header-left">
          <h2>
            Spectating{" "}
            <span className="header-table-id">({table.id})</span>
          </h2>
        </div>
        <div className="spectator-status-msg">
          {gameState.status !== "finished"
            ? `${currentTurnName}'s turn`
            : gameState.winner
            ? `${gameState.winner === "white" ? whiteName : blackName} wins!`
            : "Game over"}
        </div>
        <Link to="/" className="back-link">Home</Link>
      </div>

      {error && <div className="game-error-banner">{error}</div>}

      <div className="spectator-badge">
        👁 Spectating{spectatorCount > 1 && ` · ${spectatorCount} watching`}
      </div>

      <div className="game-layout">
        <div className="game-center">
          {/* White player info row */}
          <div className="player-info-row">
            <div className="player-pill opponent-pill">
              <span className="connection-dot connected" />
              <span className="pill-name">{whiteName}</span>
              {table.white_player?.rating != null && (
                <span className="player-rating">{table.white_player.rating}</span>
              )}
            </div>
            {isTimed && (
              <span className={getClockClass(whiteTimeMs, gameState.current_turn === "white" && gameState.status !== "finished")}>
                {formatClock(whiteTimeMs)}
              </span>
            )}
            <span className="pip-count">{pipCounts.white} pips</span>
            {table.match_points > 0 && (
              <span className="match-pts">{table.white_match_score} / {table.match_points}</span>
            )}
          </div>

          <div className="board-area perspective-white">
            <Board
              gameState={gameState}
              myColor="white"
              selectedPoint={null}
              validMoves={[]}
              onPointClick={() => {}}
              onBarClick={() => {}}
              onBearOffClick={() => {}}
              cubeValue={gameState.cube_value}
              cubeOwner={gameState.cube_owner}
            />
            <div className="board-overlay">
              <Dice
                dice={gameState.dice}
                remainingDice={gameState.remaining_dice}
                currentTurn={diceColor}
                openingRoll={gameState.opening_roll}
              />
            </div>
            {gameState.status === "finished" && (
              <div className="board-overlay-right">
                <div className="win-banner">
                  {gameState.winner === "white" ? `${whiteName} wins!` : `${blackName} wins!`}
                </div>
              </div>
            )}
          </div>

          {/* Black player info row */}
          <div className="player-info-row">
            <div className="player-pill my-pill">
              <span className="connection-dot connected" />
              <span className="pill-name">{blackName}</span>
              {table.black_player?.rating != null && (
                <span className="player-rating">{table.black_player.rating}</span>
              )}
            </div>
            {isTimed && (
              <span className={getClockClass(blackTimeMs, gameState.current_turn === "black" && gameState.status !== "finished")}>
                {formatClock(blackTimeMs)}
              </span>
            )}
            <span className="pip-count">{pipCounts.black} pips</span>
            {table.match_points > 0 && (
              <span className="match-pts">{table.black_match_score} / {table.match_points}</span>
            )}
          </div>

          <GameInfo table={table} gameStatus={gameState.status} />
        </div>
      </div>
    </div>
  );
}

export default Spectator;
