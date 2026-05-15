import React, { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Board from './Board';
import Pocket from './Pocket';
import { useWebSocket, ConnectionStatus, API_URL } from '../hooks/useWebSocket';
import {
  GameState,
  ServerMessage,
  PieceType,
  PocketPieces,
  seatBoard,
  seatColor,
  seatTeam,
  partnerSeat,
} from '../types';

const EMPTY_POCKET: PocketPieces = { p: 0, n: 0, b: 0, r: 0, q: 0 };

const seatNameMap: Record<number, string> = {
  0: 'board_a_white',
  1: 'board_a_black',
  2: 'board_b_white',
  3: 'board_b_black',
};

const GameView: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  const token = localStorage.getItem('bughouse_token') || '';
  const seatStr = localStorage.getItem('bughouse_seat');
  const mySeat = seatStr !== null ? parseInt(seatStr, 10) : null;
  const isSpectator = mySeat === null || isNaN(mySeat);

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameOverMsg, setGameOverMsg] = useState<{ winner: string | null; reason: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedPocketPiece, setSelectedPocketPiece] = useState<PieceType | null>(null);
  const [addingBots, setAddingBots] = useState(false);

  const onMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'game_state':
        setGameState(msg);
        setErrorMsg(null);
        break;
      case 'game_over':
        setGameOverMsg({ winner: msg.winner, reason: msg.reason });
        break;
      case 'error':
        setErrorMsg(msg.message);
        break;
      case 'player_joined':
      case 'player_left':
        // The server sends a game_state after these, so we just wait for it
        break;
    }
  }, []);

  const { status, sendMessage } = useWebSocket({
    gameId: gameId || '',
    token,
    onMessage,
    enabled: !!gameId && !!token,
  });

  // Determine which board is "my board"
  const myBoardIndex = mySeat !== null && !isNaN(mySeat) ? seatBoard(mySeat) : -1;
  const myColor = mySeat !== null && !isNaN(mySeat) ? seatColor(mySeat) : 'white';

  // Pre-computed per-board move handlers
  const handleMoveA = useMemo(() => (from: string, to: string, promotion: string | null) => {
    sendMessage({ type: 'move', board: 0, from, to, promotion });
    setSelectedPocketPiece(null);
  }, [sendMessage]);

  const handleMoveB = useMemo(() => (from: string, to: string, promotion: string | null) => {
    sendMessage({ type: 'move', board: 1, from, to, promotion });
    setSelectedPocketPiece(null);
  }, [sendMessage]);

  // Pre-computed per-board drop handlers
  const handleDropA = useMemo(() => (piece: string, square: string) => {
    sendMessage({ type: 'drop', board: 0, piece, square });
    setSelectedPocketPiece(null);
  }, [sendMessage]);

  const handleDropB = useMemo(() => (piece: string, square: string) => {
    sendMessage({ type: 'drop', board: 1, piece, square });
    setSelectedPocketPiece(null);
  }, [sendMessage]);

  const handleResign = useCallback(() => {
    if (window.confirm('Are you sure you want to resign?')) {
      sendMessage({ type: 'resign' });
    }
  }, [sendMessage]);

  const handleBackToLobby = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleAddBot = useCallback(async (seat: number) => {
    if (!gameId) return;
    setAddingBots(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const authToken = localStorage.getItem('bughouse_auth_token');
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
      const res = await fetch(`${API_URL}/api/games/${gameId}/add-bot`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ seat: seatNameMap[seat] }),
      });
      if (!res.ok) {
        console.error('Failed to add bot: server returned', res.status);
      }
    } catch (err) {
      console.error('Failed to add bot:', err);
    } finally {
      setAddingBots(false);
    }
  }, [gameId]);

  const handleFillBots = useCallback(async () => {
    if (!gameState) return;
    setAddingBots(true);
    try {
      for (let seat = 0; seat < 4; seat++) {
        if (!gameState.players[String(seat)]) {
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            const authToken = localStorage.getItem('bughouse_auth_token');
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
            const res = await fetch(`${API_URL}/api/games/${gameId}/add-bot`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ seat: seatNameMap[seat] }),
            });
            if (!res.ok) {
              console.error('Failed to add bot to seat', seat, ': server returned', res.status);
            }
          } catch (err) {
            console.error('Failed to add bot to seat', seat, ':', err);
          }
        }
      }
    } finally {
      setAddingBots(false);
    }
  }, [gameState, gameId]);

  // Get pockets for display
  const getPocket = useCallback((key: string): PocketPieces => {
    if (!gameState) return EMPTY_POCKET;
    return (gameState.pockets as any)[key] || EMPTY_POCKET;
  }, [gameState]);

  // Player name helper
  const playerName = useCallback((seat: number): string => {
    if (!gameState) return '...';
    return gameState.players[String(seat)] || 'Waiting...';
  }, [gameState]);

  // Determine which legal moves/drops apply to the player
  const legalMoves = gameState?.legal_moves || [];
  const legalDrops = gameState?.legal_drops || [];

  // Build board orientation
  const boardAOrientation = useMemo(() => {
    if (isSpectator) return 'white' as const;
    if (mySeat === 1) return 'black' as const;
    return 'white' as const;
  }, [isSpectator, mySeat]);

  const boardBOrientation = useMemo(() => {
    if (isSpectator) return 'white' as const;
    if (mySeat === 3) return 'black' as const;
    return 'white' as const;
  }, [isSpectator, mySeat]);

  // Who is the "top" and "bottom" player for each board visually
  // If orientation is white, white is at bottom. If black, black is at bottom.
  const boardATopPlayer = boardAOrientation === 'white' ? 1 : 0; // seat at top
  const boardABottomPlayer = boardAOrientation === 'white' ? 0 : 1; // seat at bottom
  const boardBTopPlayer = boardBOrientation === 'white' ? 3 : 2;
  const boardBBottomPlayer = boardBOrientation === 'white' ? 2 : 3;

  // Which pocket to show near which board position
  // The pocket shows pieces available to the player at that position
  const boardAPocketKeyTop = boardAOrientation === 'white' ? 'board_a_black' : 'board_a_white';
  const boardAPocketKeyBottom = boardAOrientation === 'white' ? 'board_a_white' : 'board_a_black';
  const boardBPocketKeyTop = boardBOrientation === 'white' ? 'board_b_black' : 'board_b_white';
  const boardBPocketKeyBottom = boardBOrientation === 'white' ? 'board_b_white' : 'board_b_black';

  // Turn indicators per board
  const boardATurn = gameState?.turn[0] || 'white';
  const boardBTurn = gameState?.turn[1] || 'white';

  const isMyTurnOnBoardA = !isSpectator && myBoardIndex === 0 && boardATurn === myColor;
  const isMyTurnOnBoardB = !isSpectator && myBoardIndex === 1 && boardBTurn === myColor;

  // Team display
  const myTeam = mySeat !== null && !isNaN(mySeat) ? seatTeam(mySeat) : null;
  const myPartner = mySeat !== null && !isNaN(mySeat) ? partnerSeat(mySeat) : null;

  // Status badge
  const statusText = useMemo(() => {
    if (!gameState) return 'Connecting...';
    if (gameState.status === 'waiting') return 'Waiting for players';
    if (gameState.status === 'finished') return 'Game over';
    if (isSpectator) return 'Spectating';
    if (myBoardIndex === 0) {
      return isMyTurnOnBoardA ? 'Your turn' : "Opponent's turn";
    }
    if (myBoardIndex === 1) {
      return isMyTurnOnBoardB ? 'Your turn' : "Opponent's turn";
    }
    return 'In progress';
  }, [gameState, isSpectator, myBoardIndex, isMyTurnOnBoardA, isMyTurnOnBoardB]);

  const statusClass = useMemo(() => {
    if (!gameState) return 'status-connecting';
    if (gameState.status === 'waiting') return 'status-waiting';
    if (gameState.status === 'finished') return 'status-finished';
    if (!isSpectator && (isMyTurnOnBoardA || isMyTurnOnBoardB)) return 'status-my-turn';
    return 'status-playing';
  }, [gameState, isSpectator, isMyTurnOnBoardA, isMyTurnOnBoardB]);

  if (!gameId || !token) {
    return (
      <div className="game-view-error">
        <p>Missing game ID or token.</p>
        <button className="btn btn-primary" onClick={handleBackToLobby}>Back to Lobby</button>
      </div>
    );
  }

  return (
    <div className="game-view">
      {/* Header bar */}
      <div className="game-header">
        <button className="btn btn-small" onClick={handleBackToLobby}>Lobby</button>
        <div className="game-header-center">
          <span className="game-id">Game: {gameId.substring(0, 8)}</span>
          <span className={`status-badge ${statusClass}`}>{statusText}</span>
          <ConnectionIndicator status={status} />
        </div>
        <div className="game-header-right">
          {!isSpectator && myTeam && (
            <span className="team-badge">Team {myTeam.toUpperCase()}</span>
          )}
          {isSpectator && <span className="team-badge spectator-badge">Spectator</span>}
        </div>
      </div>

      {/* Waiting overlay */}
      {gameState?.status === 'waiting' && (
        <div className="waiting-overlay">
          <div className="waiting-content">
            <h2>Waiting for players...</h2>
            <p>Share this game code with friends:</p>
            <div className="game-code">{gameId}</div>
            <p className="waiting-players">
              {Object.values(gameState.players).filter(Boolean).length}/4 players joined
            </p>
            <div className="player-slots">
              {[0, 1, 2, 3].map((seat) => (
                <div key={seat} className={`player-slot ${gameState.players[String(seat)] ? 'filled' : ''}`}>
                  <span className="slot-seat">
                    {seat === 0 ? 'A-White' : seat === 1 ? 'A-Black' : seat === 2 ? 'B-White' : 'B-Black'}
                  </span>
                  <span className="slot-name">{gameState.players[String(seat)] || 'Empty'}</span>
                  <span className="slot-team">Team {seatTeam(seat).toUpperCase()}</span>
                  {!gameState.players[String(seat)] && !isSpectator && (
                    <button className="btn add-bot-btn" onClick={() => handleAddBot(seat)} disabled={addingBots}>Add Bot</button>
                  )}
                </div>
              ))}
            </div>
            {!isSpectator && Object.values(gameState.players).some(p => !p) && (
              <button className="btn fill-bots-btn" onClick={handleFillBots} disabled={addingBots}>Fill with Bots</button>
            )}
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {gameOverMsg && (
        <div className="game-over-overlay">
          <div className="game-over-content">
            <h2>Game Over</h2>
            <p className="game-over-reason">{gameOverMsg.reason}</p>
            {gameOverMsg.winner ? (
              <p className="game-over-winner">
                Team {gameOverMsg.winner.toUpperCase()} wins!
                {!isSpectator && myTeam === gameOverMsg.winner && ' You won!'}
                {!isSpectator && myTeam !== gameOverMsg.winner && ' You lost.'}
              </p>
            ) : (
              <p className="game-over-winner">Draw</p>
            )}
            <button className="btn btn-primary" onClick={handleBackToLobby}>Back to Lobby</button>
          </div>
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <div className="game-error">
          {errorMsg}
        </div>
      )}

      {/* Boards area */}
      <div className="boards-area">
        {/* Board A */}
        <div className="board-panel">
          <div className="board-player top">
            <span className={`player-name ${boardATurn === (boardAOrientation === 'white' ? 'black' : 'white') ? 'active-turn' : ''}`}>
              {playerName(boardATopPlayer)}
            </span>
            <Pocket
              pieces={getPocket(boardAPocketKeyTop)}
              color={boardAOrientation === 'white' ? 'black' : 'white'}
              isActive={!isSpectator && myBoardIndex === 0 && boardATopPlayer === mySeat && isMyTurnOnBoardA}
              onSelect={setSelectedPocketPiece}
              selectedPiece={myBoardIndex === 0 && boardATopPlayer === mySeat ? selectedPocketPiece : null}
            />
          </div>
          <Board
            fen={gameState?.boards[0]?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}
            orientation={boardAOrientation}
            isMyBoard={!isSpectator && myBoardIndex === 0}
            isMyTurn={isMyTurnOnBoardA}
            legalMoves={myBoardIndex === 0 ? legalMoves : []}
            legalDrops={myBoardIndex === 0 ? legalDrops : []}
            lastMove={gameState?.boards[0]?.last_move || null}
            onMove={handleMoveA}
            onDrop={handleDropA}
            selectedPocketPiece={myBoardIndex === 0 ? selectedPocketPiece : null}
            boardIndex={0}
          />
          <div className="board-player bottom">
            <Pocket
              pieces={getPocket(boardAPocketKeyBottom)}
              color={boardAOrientation === 'white' ? 'white' : 'black'}
              isActive={!isSpectator && myBoardIndex === 0 && boardABottomPlayer === mySeat && isMyTurnOnBoardA}
              onSelect={setSelectedPocketPiece}
              selectedPiece={myBoardIndex === 0 && boardABottomPlayer === mySeat ? selectedPocketPiece : null}
            />
            <span className={`player-name ${boardATurn === (boardAOrientation === 'white' ? 'white' : 'black') ? 'active-turn' : ''}`}>
              {playerName(boardABottomPlayer)}
            </span>
          </div>
        </div>

        {/* Board B */}
        <div className="board-panel">
          <div className="board-player top">
            <span className={`player-name ${boardBTurn === (boardBOrientation === 'white' ? 'black' : 'white') ? 'active-turn' : ''}`}>
              {playerName(boardBTopPlayer)}
            </span>
            <Pocket
              pieces={getPocket(boardBPocketKeyTop)}
              color={boardBOrientation === 'white' ? 'black' : 'white'}
              isActive={!isSpectator && myBoardIndex === 1 && boardBTopPlayer === mySeat && isMyTurnOnBoardB}
              onSelect={setSelectedPocketPiece}
              selectedPiece={myBoardIndex === 1 && boardBTopPlayer === mySeat ? selectedPocketPiece : null}
            />
          </div>
          <Board
            fen={gameState?.boards[1]?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}
            orientation={boardBOrientation}
            isMyBoard={!isSpectator && myBoardIndex === 1}
            isMyTurn={isMyTurnOnBoardB}
            legalMoves={myBoardIndex === 1 ? legalMoves : []}
            legalDrops={myBoardIndex === 1 ? legalDrops : []}
            lastMove={gameState?.boards[1]?.last_move || null}
            onMove={handleMoveB}
            onDrop={handleDropB}
            selectedPocketPiece={myBoardIndex === 1 ? selectedPocketPiece : null}
            boardIndex={1}
          />
          <div className="board-player bottom">
            <Pocket
              pieces={getPocket(boardBPocketKeyBottom)}
              color={boardBOrientation === 'white' ? 'white' : 'black'}
              isActive={!isSpectator && myBoardIndex === 1 && boardBBottomPlayer === mySeat && isMyTurnOnBoardB}
              onSelect={setSelectedPocketPiece}
              selectedPiece={myBoardIndex === 1 && boardBBottomPlayer === mySeat ? selectedPocketPiece : null}
            />
            <span className={`player-name ${boardBTurn === (boardBOrientation === 'white' ? 'white' : 'black') ? 'active-turn' : ''}`}>
              {playerName(boardBBottomPlayer)}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      {!isSpectator && gameState?.status === 'playing' && (
        <div className="game-footer">
          <button className="btn btn-danger" onClick={handleResign}>Resign</button>
          {myPartner !== null && (
            <span className="partner-info">
              Partner: {playerName(myPartner)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// Small connection status indicator
const ConnectionIndicator: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
  const color = status === 'connected' ? '#4caf50'
    : status === 'connecting' ? '#ff9800'
    : status === 'error' ? '#f44336'
    : '#888';
  return (
    <span className="connection-indicator" title={`WebSocket: ${status}`}>
      <span className="connection-dot" style={{ backgroundColor: color }} />
    </span>
  );
};

export default GameView;
