import { useState } from "react";
import { createGame, joinGame } from "../services/api";
import type { SessionData } from "../types/game";
import "./styles/HomeScreen.css";

interface HomeScreenProps {
  onSessionCreated: (session: SessionData) => void;
}

type Mode = "idle" | "create" | "join";

export default function HomeScreen({ onSessionCreated }: HomeScreenProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [name, setName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await createGame(name.trim());
      onSessionCreated({
        game_id: res.game_id,
        player_id: res.player_id,
        session_token: res.session_token,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!gameCode.trim()) {
      setError("Please enter a game code");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await joinGame(gameCode.trim().toUpperCase(), name.trim());
      onSessionCreated({
        game_id: res.game_id,
        player_id: res.player_id,
        session_token: res.session_token,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join game");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" && !loading) {
      action();
    }
  };

  return (
    <div className="home screen-enter">
      <div className="home-content">
        <div className="home-header">
          <h1 className="home-title">Sneaky Sabotage</h1>
          <p className="home-tagline">
            Puzzles. Deception. Deduction.
          </p>
        </div>

        {mode === "idle" && (
          <div className="home-actions">
            <button
              className="btn btn-primary home-action-btn"
              onClick={() => setMode("create")}
            >
              Create Game
            </button>
            <button
              className="btn btn-outline home-action-btn"
              onClick={() => setMode("join")}
            >
              Join Game
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="home-form">
            <label className="home-label" htmlFor="create-name">
              Your Name
            </label>
            <input
              id="create-name"
              className="home-input"
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, handleCreate)}
              maxLength={20}
              autoFocus
              autoComplete="off"
            />
            {error && <p className="home-error">{error}</p>}
            <button
              className="btn btn-primary home-action-btn"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? "Creating..." : "Create Game"}
            </button>
            <button
              className="btn btn-ghost home-action-btn"
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
            >
              Back
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="home-form">
            <label className="home-label" htmlFor="join-code">
              Game Code
            </label>
            <input
              id="join-code"
              className="home-input home-input-code"
              type="text"
              placeholder="ABCD"
              value={gameCode}
              onChange={(e) =>
                setGameCode(e.target.value.toUpperCase().slice(0, 8))
              }
              onKeyDown={(e) => handleKeyDown(e, handleJoin)}
              maxLength={8}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
            />
            <label className="home-label" htmlFor="join-name">
              Your Name
            </label>
            <input
              id="join-name"
              className="home-input"
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, handleJoin)}
              maxLength={20}
              autoComplete="off"
            />
            {error && <p className="home-error">{error}</p>}
            <button
              className="btn btn-primary home-action-btn"
              onClick={handleJoin}
              disabled={loading}
            >
              {loading ? "Joining..." : "Join Game"}
            </button>
            <button
              className="btn btn-ghost home-action-btn"
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
