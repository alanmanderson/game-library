/**
 * ReanalyzeModal – lets the user re-run analysis with different settings.
 *
 * Supports selecting analyzer (gnubg / ML / heuristic), depth (ply),
 * and scope (all moves vs a subset). Shows a diff preview of old → new
 * settings and an estimated analysis time.
 */

import { useState, useCallback } from "react";
import type { AnalysisData } from "../types/game";
import "./styles/ReanalyzeModal.css";

export type AnalyzerType = "gnubg" | "ml" | "heuristic";

interface ReanalyzeModalProps {
  /** Current analysis data (for showing "currently" diff). */
  currentAnalysis: AnalysisData | null;
  /** Total number of moves in the game. */
  totalMoves: number;
  /** Called when the user confirms re-analysis. */
  onConfirm: (ply: 0 | 2 | 3) => void;
  /** Called when the user closes the modal. */
  onClose: () => void;
}

/** Estimate analysis time based on move count and ply. */
function estimateTime(moves: number, ply: number): string {
  const perMove = ply >= 3 ? 5.5 : ply >= 2 ? 1.2 : 0.3;
  const totalSec = Math.round(moves * perMove);
  if (totalSec < 60) return `~${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? `~${min}m ${sec}s` : `~${min}m`;
}

export default function ReanalyzeModal({
  currentAnalysis,
  totalMoves,
  onConfirm,
  onClose,
}: ReanalyzeModalProps) {
  const [analyzer, setAnalyzer] = useState<AnalyzerType>("gnubg");
  const [ply, setPly] = useState<0 | 2 | 3>(3);

  const currentSource = currentAnalysis?.analysis_source ?? "Unknown";
  const currentPly = currentAnalysis?.analysis_ply ?? 2;

  const newLabel =
    analyzer === "gnubg"
      ? `gnubg \u00b7 ${ply}-ply`
      : analyzer === "ml"
        ? "ML net \u00b7 0-ply"
        : "Heuristic \u00b7 pip-count";

  const effectivePly: 0 | 2 | 3 =
    analyzer === "gnubg" ? ply : 0;

  const handleConfirm = useCallback(() => {
    onConfirm(effectivePly);
  }, [onConfirm, effectivePly]);

  return (
    <div className="reanalyze-overlay" onClick={onClose}>
      <div className="reanalyze-modal" onClick={(e) => e.stopPropagation()}>
        <div className="reanalyze-head">
          <div>
            <h3 className="reanalyze-title">Re-analyze this game</h3>
            <p className="reanalyze-subtitle">
              Replace the existing analysis with a fresh pass. The current
              results stay until the new run completes.
            </p>
          </div>
          <button
            className="reanalyze-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>
            </svg>
          </button>
        </div>

        <div className="reanalyze-body">
          {/* Analyzer selector */}
          <div className="reanalyze-row">
            <div className="reanalyze-label">
              Analyzer
              <span className="reanalyze-sublabel">Engine that scores moves</span>
            </div>
            <div className="reanalyze-toggle-group">
              <button
                className={`reanalyze-tgl${analyzer === "gnubg" ? " reanalyze-tgl--active" : ""}`}
                onClick={() => setAnalyzer("gnubg")}
              >
                gnubg
                <span className="reanalyze-tgl-sub">world-class</span>
              </button>
              <button
                className={`reanalyze-tgl${analyzer === "ml" ? " reanalyze-tgl--active" : ""}`}
                onClick={() => setAnalyzer("ml")}
              >
                ML net
                <span className="reanalyze-tgl-sub">fast &middot; in-house</span>
              </button>
              <button
                className={`reanalyze-tgl${analyzer === "heuristic" ? " reanalyze-tgl--active" : ""}`}
                onClick={() => setAnalyzer("heuristic")}
              >
                Heuristic
                <span className="reanalyze-tgl-sub">pip-count</span>
              </button>
            </div>
          </div>

          {/* Depth selector (only for gnubg) */}
          {analyzer === "gnubg" && (
            <div className="reanalyze-row">
              <div className="reanalyze-label">
                Depth
                <span className="reanalyze-sublabel">Plies of lookahead</span>
              </div>
              <div className="reanalyze-pill-bar">
                {([0, 2, 3] as const).map((p) => (
                  <button
                    key={p}
                    className={`reanalyze-pill${ply === p ? " reanalyze-pill--active" : ""}`}
                    onClick={() => setPly(p)}
                  >
                    {p}-ply
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Diff preview */}
          <div className="reanalyze-row">
            <div className="reanalyze-label">
              Currently
              <span className="reanalyze-sublabel">What the previous run used</span>
            </div>
            <div className="reanalyze-diff">
              <span className="reanalyze-diff-from">
                {currentSource} &middot; {currentPly}-ply
              </span>
              <span className="reanalyze-diff-arrow">&rarr;</span>
              <span className="reanalyze-diff-to">{newLabel}</span>
            </div>
          </div>
        </div>

        <div className="reanalyze-foot">
          <div className="reanalyze-est">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2.2"/>
              <circle cx="5.5" cy="5.5" r="0.9" fill="currentColor"/>
              <circle cx="10.5" cy="10.5" r="0.9" fill="currentColor"/>
            </svg>
            <span>
              Est. <strong>{estimateTime(totalMoves, effectivePly)}</strong> &middot; {totalMoves} positions
            </span>
          </div>
          <div className="reanalyze-actions">
            <button className="reanalyze-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button className="reanalyze-btn-confirm" onClick={handleConfirm}>
              {analyzer === "gnubg"
                ? `Re-analyze at ${ply}-ply`
                : "Re-analyze"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
