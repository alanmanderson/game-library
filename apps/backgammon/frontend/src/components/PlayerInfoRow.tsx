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
          <img src="/images/bot.png" alt="Bot" className="bot-avatar" />
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
