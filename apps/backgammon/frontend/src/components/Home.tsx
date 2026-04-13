import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Player, BotDifficulty, TimeControl } from "../types/game";
import { createTable, joinTable, inviteBot } from "../services/api";
import Dashboard from "./Dashboard";
import Lobby from "./Lobby";
import Leaderboard from "./Leaderboard";
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
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("hard");
  const [showLobby, setShowLobby] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [timeControl, setTimeControl] = useState<TimeControl>("unlimited");

  const handleCreateTable = useCallback(async () => {
    setCreatingTable(true);
    setError(null);
    try {
      const table = await createTable(player.id, preferredColor, matchPoints, false, timeControl);
      navigate(`/game/${table.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create table.");
    } finally {
      setCreatingTable(false);
    }
  }, [player.id, navigate, preferredColor, matchPoints, timeControl]);

  const handlePlayBot = useCallback(async () => {
    setCreatingBotGame(true);
    setError(null);
    try {
      const table = await createTable(player.id, preferredColor, matchPoints, false, timeControl);
      await inviteBot(table.id, botDifficulty);
      navigate(`/game/${table.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start bot game.");
    } finally {
      setCreatingBotGame(false);
    }
  }, [player.id, navigate, preferredColor, matchPoints, botDifficulty, timeControl]);

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

  if (showLobby) {
    return (
      <Lobby
        player={player}
        onBack={() => setShowLobby(false)}
        preferredColor={preferredColor}
        matchPoints={matchPoints}
      />
    );
  }

  if (showLeaderboard) {
    return (
      <Leaderboard
        playerId={player.is_guest ? null : player.id}
        onBack={() => setShowLeaderboard(false)}
      />
    );
  }

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

        {/* Time control selector */}
        <div className="time-control-selector">
          <span className="time-control-label">Time control:</span>
          <div className="time-control-options">
            {([
              { value: "unlimited" as TimeControl, label: "Unlimited" },
              { value: "classical" as TimeControl, label: "Classical (15m)" },
              { value: "rapid" as TimeControl, label: "Rapid (7m)" },
              { value: "blitz" as TimeControl, label: "Blitz (3m)" },
            ]).map(({ value, label }) => (
              <button
                key={value}
                className={`time-control-option ${timeControl === value ? "selected" : ""}`}
                onClick={() => setTimeControl(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Bot difficulty selector */}
        <div className="difficulty-selector">
          <span className="difficulty-label">Bot difficulty:</span>
          <div className="difficulty-options">
            {(["easy", "medium", "hard", "expert"] as BotDifficulty[]).map((d) => (
              <button
                key={d}
                className={`difficulty-option ${botDifficulty === d ? "selected" : ""}`}
                onClick={() => setBotDifficulty(d)}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Play vs Bot */}
        <div className="action-card">
          <h3>Play vs Bot</h3>
          <p>Start a game against the AI bot.</p>
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

        {/* Find Game (Lobby) */}
        <div className="action-card">
          <h3>Find Game</h3>
          <p>Browse open games or get matched with an opponent.</p>
          <button onClick={() => setShowLobby(true)}>
            Game Lobby
          </button>
        </div>

        {/* Tournaments */}
        <div className="action-card">
          <h3>Tournaments</h3>
          <p>Join or create single-elimination tournaments.</p>
          <button onClick={() => navigate("/tournament")}>
            View Tournaments
          </button>
        </div>

        {/* Leaderboard */}
        <div className="action-card">
          <h3>Leaderboard</h3>
          <p>See the top players ranked by wins, win rate, and rating.</p>
          <button onClick={() => setShowLeaderboard(true)}>
            View Leaderboard
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
