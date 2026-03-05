import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Player } from "../types/game";
import { createTable, joinTable } from "../services/api";
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

  const handleCreateTable = useCallback(async () => {
    setCreatingTable(true);
    setError(null);
    try {
      const table = await createTable(player.id);
      navigate(`/game/${table.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create table.");
    } finally {
      setCreatingTable(false);
    }
  }, [player.id, navigate]);

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
        <h1>Backgammon Online</h1>
        <p className="welcome-text">
          Welcome, <strong>{player.nickname}</strong>
          {player.is_guest && <span className="guest-badge"> (Guest)</span>}
        </p>
      </div>

      <div className="home-actions">
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
              value={joinTableId}
              onChange={(e) => setJoinTableId(e.target.value)}
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
