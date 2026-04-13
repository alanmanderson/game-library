import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Player, BotDifficulty, TimeControl } from "../types/game";
import { createTable, joinTable, inviteBot } from "../services/api";
import Dashboard from "./Dashboard";
import Lobby from "./Lobby";
import Leaderboard from "./Leaderboard";
import { TournamentList } from "./Tournament";
import "./styles/Home.css";

interface HomeProps {
  player: Player;
}

type HomeTab = "lobby" | "dashboard" | "leaderboard" | "tournaments";

const TAB_LABELS: Record<HomeTab, string> = {
  lobby: "Lobby",
  dashboard: "Dashboard",
  leaderboard: "Leaderboard",
  tournaments: "Tournaments",
};

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
  const [timeControl, setTimeControl] = useState<TimeControl>("unlimited");
  const [activeTab, setActiveTab] = useState<HomeTab>("lobby");

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

  return (
    <div className="home">
      {/* Welcome Bar */}
      <div className="home-welcome-bar">
        <span className="app-title">Backgammon Online</span>
        <span className="welcome-text">
          Welcome, <strong>{player.nickname}</strong>
          {player.is_guest && <span className="guest-badge"> (Guest)</span>}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="home-main">
        {/* Left: Play Panel */}
        <div className="play-panel">
          <div className="play-panel-title">New Game</div>

          <div className="config-section">
            {/* Color */}
            <div className="config-row">
              <span className="config-label">Play as</span>
              <div className="config-pill-bar">
                <button
                  className={`config-pill-option${preferredColor === "white" ? " selected" : ""}`}
                  onClick={() => setPreferredColor(preferredColor === "white" ? undefined : "white")}
                >
                  <span className="color-dot white" /> White
                </button>
                <button
                  className={`config-pill-option${preferredColor === undefined ? " selected" : ""}`}
                  onClick={() => setPreferredColor(undefined)}
                >
                  Random
                </button>
                <button
                  className={`config-pill-option${preferredColor === "black" ? " selected" : ""}`}
                  onClick={() => setPreferredColor(preferredColor === "black" ? undefined : "black")}
                >
                  <span className="color-dot black" /> Black
                </button>
              </div>
            </div>

            {/* Match Points */}
            <div className="config-row">
              <span className="config-label">Match to</span>
              <div className="config-pill-bar">
                {[1, 3, 5, 7, 10].map((pts) => (
                  <button
                    key={pts}
                    className={`config-pill-option${matchPoints === pts ? " selected" : ""}`}
                    onClick={() => setMatchPoints(pts)}
                  >
                    {pts}
                  </button>
                ))}
              </div>
            </div>

            {/* Time Control */}
            <div className="config-row">
              <span className="config-label">Time control</span>
              <div className="config-pill-bar">
                {([
                  { value: "unlimited" as TimeControl, label: "None" },
                  { value: "classical" as TimeControl, label: "15m" },
                  { value: "rapid" as TimeControl, label: "7m" },
                  { value: "blitz" as TimeControl, label: "3m" },
                ]).map(({ value, label }) => (
                  <button
                    key={value}
                    className={`config-pill-option${timeControl === value ? " selected" : ""}`}
                    onClick={() => setTimeControl(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bot Difficulty */}
            <div className="config-row">
              <span className="config-label">Bot level</span>
              <div className="config-pill-bar">
                {(["easy", "medium", "hard", "expert"] as BotDifficulty[]).map((d) => (
                  <button
                    key={d}
                    className={`config-pill-option${botDifficulty === d ? " selected" : ""}`}
                    onClick={() => setBotDifficulty(d)}
                  >
                    {d === "medium" ? "Med" : d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="play-actions">
            <button
              className="play-action-primary"
              onClick={handlePlayBot}
              disabled={creatingBotGame}
            >
              {creatingBotGame ? "Starting..." : "Play vs Bot"}
            </button>
            <button
              className="play-action-secondary"
              onClick={handleCreateTable}
              disabled={creatingTable}
            >
              {creatingTable ? "Creating..." : "Create Game"}
            </button>
          </div>

          {error && <div className="panel-error">{error}</div>}

          {/* Join Game */}
          <div className="play-divider" />
          <form className="play-join-form" onSubmit={handleJoinTable}>
            <input
              type="text"
              placeholder="Enter table code"
              aria-label="Table code"
              value={joinTableId}
              onChange={(e) => setJoinTableId(e.target.value.toUpperCase())}
              disabled={joiningTable}
            />
            <button type="submit" className="play-join-btn" disabled={joiningTable}>
              {joiningTable ? "..." : "Join"}
            </button>
          </form>
        </div>

        {/* Right: Tabbed Content */}
        <div className="content-panel">
          <div className="content-tabs" role="tablist">
            {(["lobby", "dashboard", "leaderboard", "tournaments"] as HomeTab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`content-tab${activeTab === tab ? " active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          <div className="content-tab-body" role="tabpanel">
            {activeTab === "lobby" && (
              <Lobby
                player={player}
                onBack={() => {}}
                preferredColor={preferredColor}
                matchPoints={matchPoints}
                embedded
              />
            )}
            {activeTab === "dashboard" && !player.is_guest && (
              <Dashboard playerId={player.id} />
            )}
            {activeTab === "dashboard" && player.is_guest && (
              <div className="guest-prompt">
                <h3>Track Your Progress</h3>
                <p>Create an account to track your stats, game history, and rating.</p>
              </div>
            )}
            {activeTab === "leaderboard" && (
              <Leaderboard
                playerId={player.is_guest ? null : player.id}
                onBack={() => {}}
                embedded
              />
            )}
            {activeTab === "tournaments" && (
              <TournamentList player={player} embedded />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
