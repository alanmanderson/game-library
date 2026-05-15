import type { AnalysisHintResult, AnalysisEvalResult } from "../types/game";

interface Props {
  hint: AnalysisHintResult | null;
  evaluation: AnalysisEvalResult | null;
  hintLoading: boolean;
  evalLoading: boolean;
}

function AnalysisEvalTab({ hint, evaluation, hintLoading, evalLoading }: Props) {
  return (
    <div className="analysis-eval">
      {/* Hint candidates */}
      {hintLoading && (
        <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          Loading hints...
        </div>
      )}
      {hint && hint.candidates.length > 0 && (
        <div className="analysis-eval__section">
          <div className="analysis-eval__section-title">Best Moves</div>
          <div className="analysis-hint">
            {hint.candidates.map((c) => (
              <div
                key={c.rank}
                className={`analysis-hint__candidate${c.rank === 1 ? " analysis-hint__candidate--best" : ""}`}
              >
                <span className="analysis-hint__rank">#{c.rank}</span>
                <span className="analysis-hint__notation">{c.notation}</span>
                <span className="analysis-hint__equity">
                  {c.equity >= 0 ? "+" : ""}
                  {c.equity.toFixed(3)}
                </span>
                {c.equity_diff < -0.001 && (
                  <span className="analysis-hint__diff">
                    {c.equity_diff.toFixed(3)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cube action */}
      {hint?.cube_action && (
        <div className="analysis-eval__section">
          <div className="analysis-eval__section-title">Cube Decision</div>
          <div style={{ fontSize: "0.85rem", lineHeight: 1.6 }}>
            <div>
              <strong>{hint.cube_action.recommendation}</strong>
            </div>
            <div style={{ color: "var(--text-secondary)" }}>
              No double: {hint.cube_action.equity_no_double.toFixed(3)} | D/T:{" "}
              {hint.cube_action.equity_double_take.toFixed(3)} | D/D:{" "}
              {hint.cube_action.equity_double_drop.toFixed(3)}
            </div>
          </div>
        </div>
      )}

      {/* Position evaluation */}
      {evalLoading && (
        <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          Evaluating position...
        </div>
      )}
      {evaluation && (
        <div className="analysis-eval__section">
          <div className="analysis-eval__section-title">
            Position Evaluation
          </div>

          {/* Equity bar */}
          <div className="equity-bar">
            <div className="equity-bar__value">
              Equity: {evaluation.equity >= 0 ? "+" : ""}
              {evaluation.equity.toFixed(3)}
            </div>
            <div className="equity-bar__track">
              <div
                className="equity-bar__fill"
                style={{
                  width: `${Math.max(0, Math.min(100, (evaluation.equity + 1) * 50))}%`,
                }}
              />
            </div>
            <div className="equity-bar__labels">
              <span>-1.0</span>
              <span>0</span>
              <span>+1.0</span>
            </div>
          </div>

          {/* Probability table */}
          {evaluation.probs && (
            <table className="prob-table">
              <thead>
                <tr>
                  <th className="prob-table__label"></th>
                  <th>Win</th>
                  <th>W(G)</th>
                  <th>W(BG)</th>
                  <th>L(G)</th>
                  <th>L(BG)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="prob-table__label">Prob</td>
                  <td>{(evaluation.probs.win * 100).toFixed(1)}%</td>
                  <td>{(evaluation.probs.win_g * 100).toFixed(1)}%</td>
                  <td>{(evaluation.probs.win_bg * 100).toFixed(1)}%</td>
                  <td>{(evaluation.probs.lose_g * 100).toFixed(1)}%</td>
                  <td>{(evaluation.probs.lose_bg * 100).toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {!hint && !evaluation && !hintLoading && !evalLoading && (
        <div
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.85rem",
            textAlign: "center",
            padding: "32px 0",
          }}
        >
          Press <strong>H</strong> for hints or <strong>E</strong> to evaluate
          the position
        </div>
      )}
    </div>
  );
}

export default AnalysisEvalTab;
