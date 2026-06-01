import type { Standing } from "../types/game";
import "./styles/FinalScores.css";

interface FinalScoresProps {
  standings: Standing[];
  onLeave: () => void;
}

const PODIUM_LABELS = ["1st", "2nd", "3rd"];

export default function FinalScores({ standings, onLeave }: FinalScoresProps) {
  const winner = standings[0];

  return (
    <div className="final-scores screen-enter">
      <div className="final-scores-content">
        <h2 className="final-scores-title">Game Over</h2>

        {/* Winner celebration */}
        {winner && (
          <div className="final-scores-winner">
            <span className="final-scores-crown">Winner</span>
            <h3 className="final-scores-winner-name">{winner.name}</h3>
            <span className="final-scores-winner-score">
              {winner.score} points
            </span>
          </div>
        )}

        {/* Leaderboard */}
        <div className="final-scores-leaderboard">
          {standings.map((s, i) => (
            <div
              key={s.id}
              className={`final-scores-row ${
                i === 0 ? "final-scores-row--first" : ""
              } ${i === 1 ? "final-scores-row--second" : ""} ${
                i === 2 ? "final-scores-row--third" : ""
              }`}
            >
              <span className="final-scores-rank">
                {i < 3 ? PODIUM_LABELS[i] : `${i + 1}th`}
              </span>
              <span className="final-scores-name">{s.name}</span>
              <span className="final-scores-score">{s.score}</span>
            </div>
          ))}
        </div>

        <button className="btn btn-primary final-scores-play-again" onClick={onLeave}>
          Play Again
        </button>
      </div>
    </div>
  );
}
