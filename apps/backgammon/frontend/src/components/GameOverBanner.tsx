import type { GameState, Color, Table } from "../types/game";

interface GameOverBannerProps {
  gameState: GameState;
  table: Table;
  myColor: Color;
  myName: string;
  opponentName: string;
  myScore: number;
  opponentScore: number;
  onNextGame: () => void;
}

function GameOverBanner({
  gameState,
  table,
  myColor,
  myName,
  opponentName,
  myScore,
  opponentScore,
  onNextGame,
}: GameOverBannerProps) {
  if (table.status === "game_over") {
    return (
      <div className="board-overlay-right">
        <div className="win-banner game-over-banner">
          <div className="game-over-result">
            {gameState.winner === myColor
              ? "You won this game!"
              : `${opponentName} wins this game!`}
          </div>
          <div className="game-over-score">
            {myName}: {myScore} — {opponentName}: {opponentScore}
          </div>
          <button className="next-game-btn" onClick={onNextGame}>
            Next Game
          </button>
        </div>
      </div>
    );
  }

  if (table.status === "finished") {
    return (
      <div className="board-overlay-right">
        <div className="win-banner match-over-banner">
          <div className="match-over-title">Match Over!</div>
          <div className="game-over-score">
            {myName}: {myScore} — {opponentName}: {opponentScore}
          </div>
          <div className="match-over-result">
            {(myColor === "white"
              ? table.white_match_score
              : table.black_match_score) >= table.match_points
              ? "You won the match!"
              : `${opponentName} wins the match!`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="board-overlay-right">
      <div className="win-banner">
        {gameState.winner === myColor ? "You won!" : `${opponentName} wins!`}
      </div>
    </div>
  );
}

export default GameOverBanner;
