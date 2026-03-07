import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import type { GameState, Color, Table, Move, WSMessage } from "../types/game";
import { useWebSocket } from "../hooks/useWebSocket";
import Board from "./Board";
import Dice from "./Dice";
import GameControls from "./GameControls";
import GameInfo from "./GameInfo";
import "./styles/Game.css";

function Game() {
  const { tableId } = useParams<{ tableId: string }>();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myColor, setMyColor] = useState<Color | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(true);
  const [opponentReconnected, setOpponentReconnected] = useState(false);
  const [copied, setCopied] = useState(false);

  // Get player from localStorage
  const player = useMemo(() => {
    try {
      const stored = localStorage.getItem("backgammon_player");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, []);

  const playerId = player?.id;

  // Build WebSocket URL
  const wsUrl = useMemo(() => {
    if (!tableId || !playerId) return "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/${tableId}/${playerId}`;
  }, [tableId, playerId]);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case "game_state":
        // Full state update: data contains { game_state, your_color, table }
        if (message.data.game_state) {
          setGameState(message.data.game_state);
        }
        if (message.data.your_color) {
          setMyColor(message.data.your_color);
        }
        if (message.data.table) {
          setTable(message.data.table);
        }
        setWaitingForOpponent(false);
        setError(null);
        setSelectedPoint(null);
        break;

      case "dice_rolled":
        // Just confirmation of dice roll; full state comes via subsequent game_state
        break;

      case "game_over":
        // Game finished: data has winner_id, win_type, final_score
        // The game_state was already sent via game_state message
        setSelectedPoint(null);
        break;

      case "waiting":
        // Table exists but second player hasn't joined yet
        setWaitingForOpponent(true);
        break;

      case "error":
        setError(message.data.message);
        setTimeout(() => setError(null), 5000);
        break;

      case "opponent_disconnected":
        setOpponentConnected(false);
        setOpponentReconnected(false);
        break;

      case "opponent_reconnected":
        setOpponentConnected(true);
        setOpponentReconnected(true);
        setTimeout(() => setOpponentReconnected(false), 3000);
        break;
    }
  }, []);

  const handleWsOpen = useCallback(() => {
    setError(null);
  }, []);

  const { sendMessage, isConnected } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    onOpen: handleWsOpen,
  });

  // Clear error on unmount
  useEffect(() => {
    return () => setError(null);
  }, []);

  // ----- Actions -----

  const rollDice = useCallback(() => {
    sendMessage({ action: "roll_dice" });
  }, [sendMessage]);

  const endTurn = useCallback(() => {
    sendMessage({ action: "end_turn" });
    setSelectedPoint(null);
  }, [sendMessage]);

  const undoTurn = useCallback(() => {
    sendMessage({ action: "undo_turn" });
  }, [sendMessage]);

  const offerDouble = useCallback(() => {
    sendMessage({ action: "offer_double" });
  }, [sendMessage]);

  const acceptDouble = useCallback(() => {
    sendMessage({ action: "accept_double" });
  }, [sendMessage]);

  const declineDouble = useCallback(() => {
    sendMessage({ action: "decline_double" });
  }, [sendMessage]);

  const makeMove = useCallback(
    (fromPoint: number, toPoint: number) => {
      sendMessage({ action: "make_move", from_point: fromPoint, to_point: toPoint });
      setSelectedPoint(null);
    },
    [sendMessage],
  );

  // ----- Click handling -----

  const isMyTurn = gameState?.current_turn === myColor;
  const isMovingPhase = gameState?.status === "moving";
  const validMoves = gameState?.valid_moves ?? [];

  // When status is "rolling" and dice are still present, the dice belong
  // to the *previous* player (the opponent of current_turn).
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
        // Check if the clicked point is a valid destination
        const isValidDest = validMoves.some(
          (m) => m.from_point === selectedPoint && m.to_point === point,
        );
        if (isValidDest) {
          makeMove(selectedPoint, point);
          return;
        }

        // Check if clicking a new source
        const isValidSource = validMoves.some((m) => m.from_point === point);
        if (isValidSource) {
          setSelectedPoint(point);
          return;
        }

        // Deselect
        setSelectedPoint(null);
        return;
      }

      // No selection yet - try to select a source
      const isValidSource = validMoves.some((m) => m.from_point === point);
      if (isValidSource) {
        setSelectedPoint(point);
      }
    },
    [isMyTurn, isMovingPhase, myColor, selectedPoint, validMoves, makeMove],
  );

  const handleBarClick = useCallback(() => {
    if (!isMyTurn || !isMovingPhase || !myColor) return;

    const barPoint = myColor === "white" ? 25 : 0;
    const isValidSource = validMoves.some((m) => m.from_point === barPoint);

    if (isValidSource) {
      setSelectedPoint(barPoint);
    }
  }, [isMyTurn, isMovingPhase, myColor, validMoves]);

  const handleBearOffClick = useCallback(() => {
    if (!isMyTurn || !isMovingPhase || !myColor || selectedPoint === null) return;

    const offPoint = myColor === "white" ? 0 : 25;
    const isValidDest = validMoves.some(
      (m) => m.from_point === selectedPoint && m.to_point === offPoint,
    );

    if (isValidDest) {
      makeMove(selectedPoint, offPoint);
    }
  }, [isMyTurn, isMovingPhase, myColor, selectedPoint, validMoves, makeMove]);

  // ----- Derived values -----

  const opponentName = useMemo(() => {
    if (!table || !myColor) return "Opponent";
    const opponentPlayer = myColor === "white" ? table.black_player : table.white_player;
    return opponentPlayer?.nickname ?? "Opponent";
  }, [table, myColor]);

  const myName = useMemo(() => {
    if (!table || !myColor) return "You";
    const myPlayer = myColor === "white" ? table.white_player : table.black_player;
    return myPlayer?.nickname ?? "You";
  }, [table, myColor]);

  const pipCounts = useMemo(() => {
    if (!gameState) return { white: 0, black: 0 };
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

  const myScore = table && myColor ? (myColor === "white" ? table.white_match_score : table.black_match_score) : 0;
  const opponentScore = table && myColor ? (myColor === "white" ? table.black_match_score : table.white_match_score) : 0;
  const myPips = myColor === "white" ? pipCounts.white : pipCounts.black;
  const opponentPips = myColor === "white" ? pipCounts.black : pipCounts.white;

  const handleCopy = useCallback(async () => {
    if (!tableId) return;
    try {
      await navigator.clipboard.writeText(tableId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement("input");
      el.value = tableId;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [tableId]);

  const statusMessage = useMemo(() => {
    if (!gameState) return null;
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
      return `${opponentName} offers to double to ${gameState.cube_value * 2}. Accept or decline?`;
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

  // ----- Render -----

  if (!tableId || !playerId) {
    return (
      <div className="game-page">
        <div className="game-loading">
          <p>Invalid game URL or player not found.</p>
          <Link to="/" className="back-link">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  if (waitingForOpponent && !gameState) {
    return (
      <div className="game-page">
        <div className="game-header">
          <h2>Backgammon</h2>
          <Link to="/" className="back-link">
            Home
          </Link>
        </div>
        <div className="game-loading">
          <div className="spinner" />
          <p>Waiting for opponent to join...</p>
          <div className="waiting-table-id">
            <span>Share this Table ID:</span>
            <code className="table-id-code">{tableId}</code>
            <button
              className="copy-id-btn"
              onClick={() => {
                navigator.clipboard.writeText(tableId!).catch(() => {});
              }}
            >
              Copy
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!gameState || !myColor || !table) {
    return (
      <div className="game-page">
        <div className="game-header">
          <h2>Backgammon</h2>
          <Link to="/" className="back-link">
            Home
          </Link>
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
              <button className="header-copy-btn" onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </button>
              )
            </span>
          </h2>
        </div>
        {statusMessage && (
          <div className="game-status-msg">{statusMessage}</div>
        )}
        <Link to="/" className="back-link">
          Home
        </Link>
      </div>

      {/* Connection/error banners */}
      {!opponentConnected && !opponentReconnected && (
        <div className="connection-banner">
          {opponentName} disconnected. Waiting for them to reconnect...
        </div>
      )}
      {opponentReconnected && (
        <div className="connection-banner reconnected">
          {opponentName} reconnected!
        </div>
      )}
      {error && <div className="game-error-banner">{error}</div>}

      <div className="game-layout">
        <div className="game-center">
          {/* Opponent info row */}
          <div className="player-info-row">
            <div className={`player-pill opponent-pill ${!opponentConnected ? "disconnected" : ""}`}>
              <span className={`connection-dot ${opponentConnected ? "connected" : "disconnected"}`} />
              <span className="pill-name">{opponentName}</span>
            </div>
            <span className="pip-count">{opponentPips} pips</span>
            {table.match_points > 0 && (
              <span className="match-pts">{opponentScore} / {table.match_points}</span>
            )}
          </div>

          <div className={`board-area perspective-${myColor}`}>
            <Board
              gameState={gameState}
              myColor={myColor}
              selectedPoint={selectedPoint}
              validMoves={isMyTurn ? validMoves : []}
              onPointClick={handlePointClick}
              onBarClick={handleBarClick}
              onBearOffClick={handleBearOffClick}
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
              <GameControls
                gameState={gameState}
                myColor={myColor}
                opponentName={opponentName}
                onRollDice={rollDice}
                onEndTurn={endTurn}
                onUndoTurn={undoTurn}
                onOfferDouble={offerDouble}
                onAcceptDouble={acceptDouble}
                onDeclineDouble={declineDouble}
              />
            </div>
            {gameState.status === "finished" && (
              <div className="board-overlay-right">
                <div className="win-banner">
                  {gameState.winner === myColor ? "You won!" : `${opponentName} wins!`}
                </div>
              </div>
            )}
          </div>

          {/* Player info row */}
          <div className="player-info-row">
            <div className="player-pill my-pill">
              <span className="connection-dot connected" />
              <span className="pill-name">{myName}</span>
            </div>
            <span className="pip-count">{myPips} pips</span>
            {table.match_points > 0 && (
              <span className="match-pts">{myScore} / {table.match_points}</span>
            )}
          </div>

          <GameInfo table={table} />
        </div>
      </div>
    </div>
  );
}

export default Game;
