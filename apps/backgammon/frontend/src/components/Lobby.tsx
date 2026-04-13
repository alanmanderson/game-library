import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Player, LobbyTable, ActiveGame } from "../types/game";
import { getLobby, joinTable, quickMatch, createTable, getActiveGames } from "../services/api";
import "./styles/Lobby.css";

interface LobbyProps {
  player: Player;
  onBack: () => void;
  preferredColor?: string;
  matchPoints: number;
  embedded?: boolean;
}

function Lobby({ player, onBack, preferredColor, matchPoints, embedded }: LobbyProps) {
  const navigate = useNavigate();
  const [tables, setTables] = useState<LobbyTable[]>([]);
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchLobby = useCallback(async () => {
    try {
      const [lobbyData, activeData] = await Promise.all([getLobby(), getActiveGames()]);
      setTables(lobbyData);
      setActiveGames(activeData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lobby");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and poll every 5 seconds
  useEffect(() => {
    fetchLobby();
    const interval = setInterval(fetchLobby, 5000);
    return () => clearInterval(interval);
  }, [fetchLobby]);

  const handleJoinTable = useCallback(
    async (tableId: string) => {
      setActionInProgress(tableId);
      setError(null);
      try {
        const table = await joinTable(tableId, player.id);
        navigate(`/game/${table.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to join table");
      } finally {
        setActionInProgress(null);
      }
    },
    [player.id, navigate],
  );

  const handleWatchGame = useCallback(
    (tableId: string) => {
      navigate(`/spectate/${tableId}`);
    },
    [navigate],
  );

  const handleQuickMatch = useCallback(async () => {
    setActionInProgress("quick-match");
    setError(null);
    try {
      const table = await quickMatch();
      navigate(`/game/${table.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to find match");
    } finally {
      setActionInProgress(null);
    }
  }, [navigate]);

  const handleCreatePublic = useCallback(async () => {
    setActionInProgress("create-public");
    setError(null);
    try {
      const table = await createTable(player.id, preferredColor, matchPoints, true);
      navigate(`/game/${table.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create table");
    } finally {
      setActionInProgress(null);
    }
  }, [player.id, navigate, preferredColor, matchPoints]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ago`;
  };

  return (
    <div className={`lobby${embedded ? " lobby--embedded" : ""}`}>
      {!embedded && (
        <div className="lobby-header">
          <button className="lobby-back-btn" onClick={onBack}>
            Back
          </button>
          <h2>Game Lobby</h2>
          <div className="lobby-header-spacer" />
        </div>
      )}

      <div className="lobby-actions">
        <button
          className="lobby-quick-match-btn"
          onClick={handleQuickMatch}
          disabled={actionInProgress !== null}
        >
          {actionInProgress === "quick-match" ? "Finding match..." : "Quick Match"}
        </button>
        <button
          className="lobby-create-btn"
          onClick={handleCreatePublic}
          disabled={actionInProgress !== null}
        >
          {actionInProgress === "create-public" ? "Creating..." : "Create Public Game"}
        </button>
      </div>

      {error && <div className="lobby-error">{error}</div>}

      <div className="lobby-table-list">
        <h3>Open Games {!loading && `(${tables.length})`}</h3>

        {loading && <p className="lobby-loading">Loading...</p>}

        {!loading && tables.length === 0 && (
          <p className="lobby-empty">
            No open games right now. Create one or use Quick Match!
          </p>
        )}

        {tables.map((table) => (
          <div key={table.id} className="lobby-table-item">
            <div className="lobby-table-info">
              <span className="lobby-table-creator">{table.creator_nickname}</span>
              <span className="lobby-table-details">
                Match to {table.match_points ?? 5}
                {table.preferred_color && ` \u00B7 Creator plays ${table.preferred_color}`}
              </span>
              <span className="lobby-table-time">{formatTime(table.created_at)}</span>
            </div>
            <button
              className="lobby-join-btn"
              onClick={() => handleJoinTable(table.id)}
              disabled={actionInProgress !== null}
            >
              {actionInProgress === table.id ? "Joining..." : "Join"}
            </button>
          </div>
        ))}
      </div>

      <div className="lobby-table-list lobby-active-games">
        <h3>Live Games {!loading && `(${activeGames.length})`}</h3>

        {!loading && activeGames.length === 0 && (
          <p className="lobby-empty">No live games to watch right now.</p>
        )}

        {activeGames.map((game) => (
          <div key={game.id} className="lobby-table-item">
            <div className="lobby-table-info">
              <span className="lobby-table-creator">
                {game.white_player_nickname} vs {game.black_player_nickname}
              </span>
              <span className="lobby-table-details">
                Match to {game.match_points ?? 5}
                {" \u00B7 "}
                {game.white_match_score}–{game.black_match_score}
              </span>
              <span className="lobby-table-time">
                {formatTime(game.created_at)}
                {game.spectator_count > 0 && (
                  <span className="lobby-spectator-count">
                    {" \u00B7 "}{game.spectator_count} watching
                  </span>
                )}
              </span>
            </div>
            <button
              className="lobby-watch-btn"
              onClick={() => handleWatchGame(game.id)}
              disabled={actionInProgress !== null}
            >
              Watch
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Lobby;
