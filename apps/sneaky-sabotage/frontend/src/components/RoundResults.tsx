import type { RoundResultsMessage, ClientMessage } from "../types/game";
import "./styles/RoundResults.css";

interface RoundResultsProps {
  results: RoundResultsMessage;
  isHost: boolean;
  sendMessage: (msg: ClientMessage) => void;
}

export default function RoundResults({
  results,
  isHost,
  sendMessage,
}: RoundResultsProps) {
  const handleNext = () => {
    sendMessage({ type: "next_round" });
  };

  // Sort scores by total_score descending
  const sortedScores = Object.entries(results.scores).sort(
    ([, a], [, b]) => b.total_score - a.total_score,
  );

  return (
    <div className="round-results screen-enter">
      <div className="round-results-content">
        <h2 className="round-results-title">Round {results.round_number} Results</h2>

        {/* Puzzle outcome */}
        <div
          className={`round-results-outcome ${
            results.puzzle_correct
              ? "round-results-outcome--correct"
              : "round-results-outcome--wrong"
          }`}
        >
          <span className="round-results-outcome-icon">
            {results.puzzle_correct ? "Solved!" : "Failed!"}
          </span>
          <div className="round-results-answer-block">
            {results.answer_submitted && (
              <p className="round-results-answer">
                <span className="round-results-answer-label">Submitted: </span>
                {results.answer_submitted}
              </p>
            )}
            <p className="round-results-answer">
              <span className="round-results-answer-label">Correct: </span>
              {results.correct_answer}
            </p>
          </div>
        </div>

        {/* Role reveals */}
        <div className="round-results-roles">
          <div className="round-results-role round-results-role--saboteur">
            <span className="round-results-role-label">Saboteur</span>
            <span className="round-results-role-name">
              {results.saboteur.name}
            </span>
          </div>
          {results.insider && (
            <div className="round-results-role round-results-role--insider">
              <span className="round-results-role-label">Insider</span>
              <span className="round-results-role-name">
                {results.insider.name}
              </span>
            </div>
          )}
        </div>

        {/* Events */}
        {results.events.length > 0 && (
          <div className="round-results-events">
            {results.events.map((event, i) => (
              <p key={i} className="round-results-event">
                {event}
              </p>
            ))}
          </div>
        )}

        {/* Scores */}
        <div className="round-results-scores">
          <h3 className="round-results-scores-title">Scores</h3>
          <div className="round-results-score-list">
            {sortedScores.map(([pid, score]) => (
              <div key={pid} className="round-results-score-row">
                <span className="round-results-score-name">{score.name}</span>
                <span className="round-results-score-round">
                  {score.round_score > 0 ? "+" : ""}
                  {score.round_score}
                </span>
                <span className="round-results-score-total">
                  {score.total_score}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Next round */}
        <div className="round-results-actions">
          {isHost ? (
            <button
              className="btn btn-primary round-results-next-btn"
              onClick={handleNext}
            >
              Next Round
            </button>
          ) : (
            <p className="round-results-waiting">
              Waiting for host to start next round...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
