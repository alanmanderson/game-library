import type { Player } from "../types/game";

interface PlayerInfoRowProps {
  name: string;
  player: Player | null;
  pips: number;
  isOpponent: boolean;
  isConnected: boolean;
  isBotGame: boolean;
  botDifficulty?: string;
  isTimed: boolean;
  timeMs: number | null;
  isClockActive: boolean;
  matchPoints: number;
  matchScore: number;
  isCrawfordGame?: boolean;
  formatClock: (ms: number | null) => string;
  getClockClass: (ms: number | null, isActive: boolean) => string;
}

function PlayerInfoRow({
  name,
  player,
  pips,
  isOpponent,
  isConnected,
  isBotGame,
  botDifficulty,
  isTimed,
  timeMs,
  isClockActive,
  matchPoints,
  matchScore,
  isCrawfordGame,
  formatClock,
  getClockClass,
}: PlayerInfoRowProps) {
  return (
    <div className="player-info-row">
      <div
        className={`player-pill ${isOpponent ? "opponent-pill" : "my-pill"}${
          isOpponent && !isConnected ? " disconnected" : ""
        }`}
      >
        <span
          className={`connection-dot ${isConnected ? "connected" : "disconnected"}`}
        />
        {isOpponent && isBotGame && (
          <svg
            className="bot-avatar"
            role="img"
            aria-label="Bot"
            viewBox="0 0 32 32"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Head */}
            <rect x="6" y="8" width="20" height="16" rx="3" ry="3" fill="none" stroke="var(--accent)" strokeWidth="2"/>
            {/* Eyes */}
            <circle cx="12" cy="16" r="2.5" fill="var(--accent)"/>
            <circle cx="20" cy="16" r="2.5" fill="var(--accent)"/>
            {/* Antenna */}
            <line x1="16" y1="8" x2="16" y2="3" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="16" cy="2" r="1.5" fill="var(--accent)"/>
          </svg>
        )}
        <span className="pill-name">{name}</span>
        {isOpponent && isBotGame && botDifficulty && (
          <span
            className={`bot-difficulty-badge difficulty-${botDifficulty}`}
          >
            {botDifficulty}
          </span>
        )}
        {!isBotGame && player?.rating != null && (
          <span className="player-rating">{player.rating}</span>
        )}
      </div>
      {isTimed && (
        <span className={getClockClass(timeMs, isClockActive)}>
          {formatClock(timeMs)}
        </span>
      )}
      <span className="pip-count">{pips} pips</span>
      {matchPoints > 0 && (
        <span className="match-pts">
          {matchScore} / {matchPoints}
        </span>
      )}
      {isOpponent && isCrawfordGame && (
        <span className="crawford-badge">Crawford Game</span>
      )}
    </div>
  );
}

export default PlayerInfoRow;
