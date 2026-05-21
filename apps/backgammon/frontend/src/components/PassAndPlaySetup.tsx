import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { createPassAndPlayTable } from "../services/api";
import "./styles/PassAndPlaySetup.css";

const MATCH_POINT_OPTIONS = [1, 3, 5, 7, 9] as const;

function PassAndPlaySetup() {
  const navigate = useNavigate();
  const [player2Name, setPlayer2Name] = useState("");
  const [matchPoints, setMatchPoints] = useState(5);
  const [doublingCube, setDoublingCube] = useState(true);
  const [crawfordRule, setCrawfordRule] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const table = await createPassAndPlayTable(
        player2Name.trim() || "Player 2",
        undefined,
        matchPoints,
        doublingCube,
        crawfordRule,
      );
      navigate(`/game/${table.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game.");
    } finally {
      setSubmitting(false);
    }
  }, [player2Name, matchPoints, doublingCube, crawfordRule, navigate]);

  return (
    <div className="pp-setup">
      <div className="pp-setup-back">
        <Link to="/">&larr; Back</Link>
      </div>

      <div className="pp-setup-card">
        <div className="pp-setup-header">
          <h1>Pass &amp; Play</h1>
          <p className="pp-setup-subtitle">Share the device. Unrated.</p>
        </div>

        {/* Player 2 name */}
        <div className="pp-setup-field">
          <label className="pp-setup-label" htmlFor="pp-player2-name">
            Player 2 name
          </label>
          <input
            id="pp-player2-name"
            className="pp-setup-input"
            type="text"
            placeholder="Player 2"
            value={player2Name}
            onChange={(e) => setPlayer2Name(e.target.value)}
            maxLength={24}
          />
        </div>

        {/* Match length */}
        <div className="pp-setup-field">
          <span className="pp-setup-label">Match to</span>
          <div className="pp-setup-pill-bar">
            {MATCH_POINT_OPTIONS.map((pts) => (
              <button
                key={pts}
                className={`pp-setup-pill${matchPoints === pts ? " pp-setup-pill--selected" : ""}`}
                onClick={() => setMatchPoints(pts)}
                type="button"
              >
                {pts}
              </button>
            ))}
          </div>
        </div>

        {/* Doubling cube toggle */}
        <div className="pp-setup-field">
          <div className="pp-setup-toggle-row">
            <span className="pp-setup-toggle-label">Doubling cube</span>
            <label className="pp-setup-toggle">
              <input
                type="checkbox"
                checked={doublingCube}
                onChange={(e) => {
                  setDoublingCube(e.target.checked);
                  if (!e.target.checked) setCrawfordRule(false);
                }}
              />
              <span className="pp-setup-toggle-track" />
            </label>
          </div>
        </div>

        {/* Crawford rule toggle (only when cube is on) */}
        {doublingCube && (
          <div className="pp-setup-field">
            <div className="pp-setup-toggle-row">
              <span className="pp-setup-toggle-label">Crawford rule</span>
              <label className="pp-setup-toggle">
                <input
                  type="checkbox"
                  checked={crawfordRule}
                  onChange={(e) => setCrawfordRule(e.target.checked)}
                />
                <span className="pp-setup-toggle-track" />
              </label>
            </div>
          </div>
        )}

        {error && <div className="pp-setup-error">{error}</div>}

        <button
          className="pp-setup-submit"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? "Starting..." : "Start Match"}
        </button>
      </div>
    </div>
  );
}

export default PassAndPlaySetup;
