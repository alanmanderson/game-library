import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Player } from "../types/game";
import { createTable, joinTable, inviteBot } from "../services/api";
import Dashboard from "./Dashboard";
import "./styles/Home.css";

interface HomeProps {
  player: Player;
}

function Home({ player }: HomeProps) {
  const navigate = useNavigate();
  const [joinTableId, setJoinTableId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creatingTable, setCreatingTable] = useState(false);
  const [joiningTable, setJoiningTable] = useState(false);
  const [creatingBotGame, setCreatingBotGame] = useState(false);
  const [preferredColor, setPreferredColor] = useState<string | undefined>(undefined);
  const [matchPoints, setMatchPoints] = useState(5);

  const handleCreateTable = useCallback(async () => {
    setCreatingTable(true);
    setError(null);
    try {
      const table = await createTable(player.id, preferredColor, matchPoints);
      navigate(`/game/${table.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create table.");
    } finally {
      setCreatingTable(false);
    }
  }, [player.id, navigate, preferredColor, matchPoints]);

  const handlePlayBot = useCallback(async () => {
    setCreatingBotGame(true);
    setError(null);
    try {
      const table = await createTable(player.id, preferredColor, matchPoints);
      await inviteBot(table.id);
      navigate(`/game/${table.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start bot game.");
    } finally {
      setCreatingBotGame(false);
    }
  }, [player.id, navigate, preferredColor, matchPoints]);

  const handleJoinTable = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedId = joinTableId.trim();
      if (!trimmedId) {
        setError("Please enter a table ID.");
        return;
      }

      setJoiningTable(true);
      setError(null);
      try {
        const table = await joinTable(trimmedId, player.id);
        navigate(`/game/${table.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to join table.");
      } finally {
        setJoiningTable(false);
      }
    },
    [joinTableId, player.id, navigate],
  );

  return (
    <div className="home">
      <div className="home-header">
        <img src="/images/backsplash.png" alt="Backgammon Online" className="home-hero" />
        <p className="welcome-text">
          Welcome, <strong>{player.nickname}</strong>
          {player.is_guest && <span className="guest-badge"> (Guest)</span>}
        </p>
      </div>

      <div className="home-actions">
        {/* Color preference selector */}
        <div className="color-selector">
          <span className="color-selector-label">Play as:</span>
          <div className="color-options">
            <button
              className={`color-option ${preferredColor === "white" ? "selected" : ""}`}
              onClick={() => setPreferredColor(preferredColor === "white" ? undefined : "white")}
            >
              <span className="color-swatch white-swatch" /> White
            </button>
            <button
              className={`color-option ${preferredColor === undefined ? "selected" : ""}`}
              onClick={() => setPreferredColor(undefined)}
            >
              Random
            </button>
            <button
              className={`color-option ${preferredColor === "black" ? "selected" : ""}`}
              onClick={() => setPreferredColor(preferredColor === "black" ? undefined : "black")}
            >
              <span className="color-swatch black-swatch" /> Black
            </button>
          </div>
        </div>

        {/* Match points selector */}
        <div className="match-points-selector">
          <span className="match-points-label">Match to:</span>
          <div className="match-points-options">
            {[1, 3, 5, 7, 10].map((pts) => (
              <button
                key={pts}
                className={`match-points-option ${matchPoints === pts ? "selected" : ""}`}
                onClick={() => setMatchPoints(pts)}
              >
                {pts}
              </button>
            ))}
          </div>
        </div>

        {/* Play vs Bot */}
        <div className="action-card">
          <h3>Play vs Bot</h3>
          <p>Start a game against a random-move bot.</p>
          <button onClick={handlePlayBot} disabled={creatingBotGame}>
            {creatingBotGame ? "Starting..." : "Play vs Bot"}
          </button>
        </div>

        {/* Create Table */}
        <div className="action-card">
          <h3>New Game</h3>
          <p>Create a table and invite a friend to play.</p>
          <button onClick={handleCreateTable} disabled={creatingTable}>
            {creatingTable ? "Creating..." : "Create Table"}
          </button>
        </div>

        {/* Join Table */}
        <div className="action-card">
          <h3>Join Game</h3>
          <p>Enter a table ID to join an existing game.</p>
          <form className="join-form" onSubmit={handleJoinTable}>
            <input
              type="text"
              placeholder="Table ID"
              aria-label="Table code"
              value={joinTableId}
              onChange={(e) => setJoinTableId(e.target.value.toUpperCase())}
              disabled={joiningTable}
            />
            <button type="submit" disabled={joiningTable}>
              {joiningTable ? "Joining..." : "Join"}
            </button>
          </form>
        </div>
      </div>

      {error && <div className="home-error">{error}</div>}

      {/* Dashboard (only for registered users) */}
      {!player.is_guest && (
        <div className="stats-section">
          <h3>Dashboard</h3>
          <Dashboard playerId={player.id} />
        </div>
      )}
      {player.is_guest && (
        <div className="stats-section">
          <p style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>
            Statistics are only available for registered users. Create an account to track your stats.
          </p>
        </div>
      )}
    </div>
  );
}

export default Home;
