import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameListItem, CreateGameResponse, JoinGameResponse, WatchGameResponse } from '../types';
import { API_URL } from '../hooks/useWebSocket';
import { useAuth } from '../contexts/AuthContext';
import SeatPicker, { SeatNameValue } from './SeatPicker';
import AuthModal from './AuthModal';
import UserMenu from './UserMenu';

const Lobby: React.FC = () => {
  const navigate = useNavigate();
  const { user, accessToken, isGuest, loading: authLoading } = useAuth();

  const [playerName, setPlayerName] = useState(() => localStorage.getItem('bughouse_name') || '');
  const [games, setGames] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rejoin state
  const [rejoinGameId, setRejoinGameId] = useState(() => localStorage.getItem('bughouse_game_id') || '');
  const [rejoinToken, setRejoinToken] = useState(() => localStorage.getItem('bughouse_token') || '');

  // Watch state
  const [watchGameId, setWatchGameId] = useState('');

  // Seat selection state
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<SeatNameValue | null>(null);
  const [createSeat, setCreateSeat] = useState<SeatNameValue | null>(null);
  const [showCreateSeatPicker, setShowCreateSeatPicker] = useState(false);

  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Derived display name
  const displayName = user ? user.display_name : playerName;

  // Save guest name to localStorage when it changes
  useEffect(() => {
    if (playerName && isGuest) {
      localStorage.setItem('bughouse_name', playerName);
    }
  }, [playerName, isGuest]);

  // Build headers for API calls
  const apiHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return headers;
  }, [accessToken]);

  // Fetch available games
  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/games`);
      if (res.ok) {
        const data: GameListItem[] = await res.json();
        setGames(data);
      }
    } catch {
      // Silently fail on polling errors
    }
  }, []);

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 3000);
    return () => clearInterval(interval);
  }, [fetchGames]);

  const handleCreate = async () => {
    if (!displayName.trim()) {
      setError('Please enter your name.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body: any = { player_name: displayName.trim() };
      if (createSeat) {
        body.preferred_seat = createSeat;
      }
      const res = await fetch(`${API_URL}/api/games`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const respBody = await res.json().catch(() => ({}));
        throw new Error(respBody.detail || 'Failed to create game');
      }
      const data: CreateGameResponse = await res.json();
      localStorage.setItem('bughouse_game_id', data.game_id);
      localStorage.setItem('bughouse_token', data.player_token);
      localStorage.setItem('bughouse_seat', String(data.seat));
      navigate(`/game/${data.game_id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (gameId: string, seat: SeatNameValue | null) => {
    if (!displayName.trim()) {
      setError('Please enter your name.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body: any = { player_name: displayName.trim() };
      if (seat) {
        body.preferred_seat = seat;
      }
      const res = await fetch(`${API_URL}/api/games/${gameId}/join`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const respBody = await res.json().catch(() => ({}));
        throw new Error(respBody.detail || 'Failed to join game');
      }
      const data: JoinGameResponse = await res.json();
      localStorage.setItem('bughouse_game_id', gameId);
      localStorage.setItem('bughouse_token', data.player_token);
      localStorage.setItem('bughouse_seat', String(data.seat));
      navigate(`/game/${gameId}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setExpandedGame(null);
      setSelectedSeat(null);
    }
  };

  const handleRejoin = () => {
    if (!rejoinGameId.trim() || !rejoinToken.trim()) {
      setError('Please enter both game ID and token to rejoin.');
      return;
    }
    localStorage.setItem('bughouse_game_id', rejoinGameId.trim());
    localStorage.setItem('bughouse_token', rejoinToken.trim());
    navigate(`/game/${rejoinGameId.trim()}`);
  };

  const handleWatch = async () => {
    if (!watchGameId.trim()) {
      setError('Please enter a game ID to watch.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/games/${watchGameId.trim()}/watch`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ spectator_name: displayName.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || 'Failed to watch game');
      }
      const data: WatchGameResponse = await res.json();
      localStorage.setItem('bughouse_game_id', watchGameId.trim());
      localStorage.setItem('bughouse_token', data.spectator_token);
      localStorage.removeItem('bughouse_seat');
      navigate(`/game/${watchGameId.trim()}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const countPlayers = (players: Record<string, string | null>): number => {
    return Object.values(players).filter(Boolean).length;
  };

  const toggleJoinExpand = (gameId: string) => {
    if (expandedGame === gameId) {
      setExpandedGame(null);
      setSelectedSeat(null);
    } else {
      setExpandedGame(gameId);
      setSelectedSeat(null);
    }
  };

  const emptyPlayers: Record<string, string | null> = { '0': null, '1': null, '2': null, '3': null };

  if (authLoading) {
    return (
      <div className="lobby">
        <h1 className="lobby-title">Bughouse Chess</h1>
        <p className="lobby-subtitle">Loading...</p>
      </div>
    );
  }

  return (
    <div className="lobby">
      <h1 className="lobby-title">Bughouse Chess</h1>
      <p className="lobby-subtitle">4 players, 2 boards, 1 winning team</p>

      {/* User menu / auth status */}
      <div className="lobby-user-bar">
        <UserMenu onSignInClick={() => setShowAuthModal(true)} />
      </div>

      {error && <div className="lobby-error">{error}</div>}

      {/* Guest name input (only shown for guests) */}
      {isGuest && (
        <div className="lobby-card">
          <label className="lobby-label" htmlFor="player-name">Your Name</label>
          <input
            id="player-name"
            className="lobby-input"
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={20}
          />
        </div>
      )}

      {/* Create game */}
      <div className="lobby-card">
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={loading || !displayName.trim()}
        >
          Create Game
        </button>
        <button
          className="btn-link"
          onClick={() => setShowCreateSeatPicker(!showCreateSeatPicker)}
          style={{ marginTop: 8 }}
        >
          {showCreateSeatPicker ? 'Hide seat selection' : 'Choose your seat'}
        </button>
        {showCreateSeatPicker && (
          <div style={{ marginTop: 12 }}>
            <SeatPicker
              players={emptyPlayers}
              onSelect={(seat) => setCreateSeat(createSeat === seat ? null : seat)}
              selectedSeat={createSeat}
            />
            {createSeat && (
              <div className="seat-picker-selection">
                Selected: {createSeat.replace(/_/g, ' ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Available games */}
      <div className="lobby-card">
        <h2 className="lobby-card-title">Open Games</h2>
        {games.length === 0 ? (
          <p className="lobby-muted">No games available. Create one!</p>
        ) : (
          <div className="game-list">
            {games.map((game) => (
              <div key={game.game_id} className="game-list-item-wrapper">
                <div className="game-list-item">
                  <div className="game-list-info">
                    <span className="game-list-id">{game.game_id.substring(0, 8)}</span>
                    <span className="game-list-players">{countPlayers(game.players)}/4 players</span>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => toggleJoinExpand(game.game_id)}
                    disabled={loading || !displayName.trim()}
                  >
                    {expandedGame === game.game_id ? 'Cancel' : 'Join'}
                  </button>
                </div>
                {expandedGame === game.game_id && (
                  <div className="seat-picker-expand">
                    <SeatPicker
                      players={game.players}
                      onSelect={(seat) => setSelectedSeat(selectedSeat === seat ? null : seat)}
                      selectedSeat={selectedSeat}
                      disabled={loading}
                    />
                    <div className="seat-picker-actions">
                      <button
                        className="btn btn-primary btn-join-confirm"
                        onClick={() => handleJoin(game.game_id, selectedSeat)}
                        disabled={loading}
                      >
                        {selectedSeat ? 'Join Selected Seat' : 'Auto-assign Seat'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rejoin */}
      <div className="lobby-card">
        <h2 className="lobby-card-title">Rejoin Game</h2>
        <input
          className="lobby-input"
          type="text"
          placeholder="Game ID"
          value={rejoinGameId}
          onChange={(e) => setRejoinGameId(e.target.value)}
        />
        <input
          className="lobby-input"
          type="text"
          placeholder="Your token"
          value={rejoinToken}
          onChange={(e) => setRejoinToken(e.target.value)}
        />
        <button
          className="btn btn-secondary"
          onClick={handleRejoin}
          disabled={loading || !rejoinGameId.trim() || !rejoinToken.trim()}
        >
          Rejoin
        </button>
      </div>

      {/* Watch */}
      <div className="lobby-card">
        <h2 className="lobby-card-title">Watch a Game</h2>
        <input
          className="lobby-input"
          type="text"
          placeholder="Game ID"
          value={watchGameId}
          onChange={(e) => setWatchGameId(e.target.value)}
        />
        <button
          className="btn btn-secondary"
          onClick={handleWatch}
          disabled={loading || !watchGameId.trim()}
        >
          Watch
        </button>
      </div>

      {/* Auth modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onGuestContinue={() => {}}
      />
    </div>
  );
};

export default Lobby;
