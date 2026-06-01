import { useState } from "react";
import type { SessionData, GameState, ClientMessage } from "../types/game";
import "./styles/Lobby.css";

interface LobbyProps {
  session: SessionData;
  gameState: GameState | null;
  isConnected: boolean;
  sendMessage: (msg: ClientMessage) => void;
  onLeave: () => void;
}

const TIMER_OPTIONS = [180, 300, 420, 600];
const TIMER_LABELS: Record<number, string> = {
  180: "3 min",
  300: "5 min",
  420: "7 min",
  600: "10 min",
};

export default function Lobby({
  session,
  gameState,
  isConnected,
  sendMessage,
  onLeave,
}: LobbyProps) {
  const [copied, setCopied] = useState(false);

  const players = gameState?.players ?? [];
  const isHost = players.find((p) => p.id === session.player_id)?.is_host ?? false;
  const timerSeconds = gameState?.timer_seconds ?? 300;
  const maxRounds = gameState?.max_rounds ?? 3;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(session.game_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  };

  const handleTimerChange = (seconds: number) => {
    sendMessage({ type: "update_settings", timer_seconds: seconds });
  };

  const handleRoundsChange = (rounds: number) => {
    sendMessage({ type: "update_settings", max_rounds: rounds });
  };

  const handleKick = (playerId: string) => {
    sendMessage({ type: "kick_player", player_id: playerId });
  };

  const handleStart = () => {
    sendMessage({ type: "start_game" });
  };

  const canStart = players.length >= 3;

  return (
    <div className="lobby screen-enter">
      <div className="lobby-content">
        <div className="lobby-header">
          <h2 className="lobby-title">Game Lobby</h2>
          {!isConnected && (
            <span className="lobby-disconnected">Reconnecting...</span>
          )}
        </div>

        {/* Game code */}
        <div className="lobby-code-section">
          <p className="lobby-code-label">Share this code with friends</p>
          <button
            className="lobby-code"
            onClick={copyCode}
            aria-label={`Copy game code ${session.game_id}`}
          >
            <span className="lobby-code-text">{session.game_id}</span>
            <span className="lobby-code-hint">
              {copied ? "Copied!" : "Tap to copy"}
            </span>
          </button>
        </div>

        {/* Players */}
        <div className="lobby-section">
          <h3 className="lobby-section-title">
            Players ({players.length})
          </h3>
          <ul className="lobby-player-list">
            {players.map((p) => (
              <li key={p.id} className="lobby-player">
                <span className="lobby-player-name">
                  {p.name}
                  {p.is_host && (
                    <span className="lobby-host-badge">HOST</span>
                  )}
                  {p.id === session.player_id && (
                    <span className="lobby-you-badge">YOU</span>
                  )}
                </span>
                <span
                  className={`lobby-player-status ${
                    p.connected
                      ? "lobby-player-status--connected"
                      : "lobby-player-status--disconnected"
                  }`}
                />
                {isHost && p.id !== session.player_id && (
                  <button
                    className="lobby-kick-btn"
                    onClick={() => handleKick(p.id)}
                    aria-label={`Kick ${p.name}`}
                  >
                    Kick
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Settings (host only) */}
        {isHost && (
          <div className="lobby-section">
            <h3 className="lobby-section-title">Settings</h3>

            <div className="lobby-setting">
              <span className="lobby-setting-label">Timer per round</span>
              <div className="lobby-pills">
                {TIMER_OPTIONS.map((t) => (
                  <button
                    key={t}
                    className={`lobby-pill ${
                      timerSeconds === t ? "lobby-pill--active" : ""
                    }`}
                    onClick={() => handleTimerChange(t)}
                  >
                    {TIMER_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="lobby-setting">
              <span className="lobby-setting-label">Rounds</span>
              <div className="lobby-pills">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
                  <button
                    key={r}
                    className={`lobby-pill ${
                      maxRounds === r ? "lobby-pill--active" : ""
                    }`}
                    onClick={() => handleRoundsChange(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="lobby-actions">
          {isHost ? (
            <button
              className="btn btn-primary lobby-start-btn"
              onClick={handleStart}
              disabled={!canStart || !isConnected}
            >
              {!canStart
                ? `Need ${3 - players.length} more player${3 - players.length !== 1 ? "s" : ""}`
                : "Start Game"}
            </button>
          ) : (
            <p className="lobby-waiting">Waiting for host to start...</p>
          )}
          <button className="btn btn-ghost lobby-leave-btn" onClick={onLeave}>
            Leave Game
          </button>
        </div>
      </div>
    </div>
  );
}
