import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { AnalysisConfig, AnalysisSessionData } from "../types/game";
import { createAnalysisSession, listAnalysisSessions } from "../services/api";
import "./styles/Analysis.css";

interface Props {
  embedded?: boolean;
}

function AnalysisSetup({ embedded }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<AnalysisSessionData[]>(
    [],
  );

  // Config state
  const [playerColor, setPlayerColor] = useState<"white" | "black" | "random">(
    "white",
  );
  const [gnubgPly, setGnubgPly] = useState<0 | 1 | 2 | 3>(2);
  const [autoAnalysis, setAutoAnalysis] = useState<
    "off" | "per_move" | "per_turn"
  >("off");

  useEffect(() => {
    listAnalysisSessions()
      .then((data) =>
        setRecentSessions(
          data.sessions.filter((s) => s.status === "active").slice(0, 5),
        ),
      )
      .catch(() => {});
  }, []);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const config: AnalysisConfig = {
        game_type: "money",
        player_color: playerColor,
        gnubg_ply: gnubgPly,
        auto_analysis: autoAnalysis,
      };
      const data = await createAnalysisSession(config);
      navigate(`/analysis/${data.session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="analysis-setup">
      {!embedded && (
        <div className="analysis-setup__title">Analysis Mode</div>
      )}

      {/* Recent active sessions */}
      {recentSessions.length > 0 && (
        <div className="analysis-setup__recent">
          <div className="analysis-setup__recent-title">Resume Session</div>
          {recentSessions.map((s) => (
            <div
              key={s.id}
              className="analysis-setup__recent-item"
              onClick={() => navigate(`/analysis/${s.id}`)}
            >
              <span>
                #{s.id} &mdash; {s.game_type}, {s.player_color}
              </span>
              <span
                style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}
              >
                {new Date(s.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Configuration */}
      <div className="config-section">
        <div className="config-row">
          <span className="config-label">Play as</span>
          <div className="config-pill-bar">
            {(["white", "random", "black"] as const).map((c) => (
              <button
                key={c}
                className={`config-pill-option${playerColor === c ? " selected" : ""}`}
                onClick={() => setPlayerColor(c)}
              >
                {c === "white" && <span className="color-dot white" />}
                {c === "black" && <span className="color-dot black" />}
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="config-row">
          <span className="config-label">gnubg strength</span>
          <div className="config-pill-bar">
            {([0, 1, 2, 3] as const).map((p) => (
              <button
                key={p}
                className={`config-pill-option${gnubgPly === p ? " selected" : ""}`}
                onClick={() => setGnubgPly(p)}
              >
                {p}-ply
              </button>
            ))}
          </div>
        </div>

        <div className="config-row">
          <span className="config-label">Auto analysis</span>
          <div className="config-pill-bar">
            {(
              [
                { value: "off" as const, label: "Off" },
                { value: "per_turn" as const, label: "Per turn" },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                className={`config-pill-option${autoAnalysis === value ? " selected" : ""}`}
                onClick={() => setAutoAnalysis(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="play-actions">
        <button
          className="play-action-primary"
          onClick={handleStart}
          disabled={loading}
        >
          {loading ? "Starting..." : "Start Analysis"}
        </button>
      </div>

      {error && <div className="panel-error">{error}</div>}
    </div>
  );
}

export default AnalysisSetup;
