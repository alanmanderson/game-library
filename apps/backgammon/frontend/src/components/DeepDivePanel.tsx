/**
 * DeepDivePanel – full position analysis at maximum depth.
 *
 * Shows win probability bar, cubeless/cubeful equity, top candidate
 * moves with equity deltas, and cube decision. Can be rendered in
 * full or compact mode (compact hides cube decision).
 */

import type { DeepDiveResult, MoveCandidate } from "../types/game";
import { notationToPlayerPerspective } from "../utils/notation";
import "./styles/DeepDivePanel.css";

interface DeepDivePanelProps {
  data: DeepDiveResult;
  /** The notation of the move actually played. */
  playedNotation: string;
  /** When true, hides cube decision to save vertical space. */
  compact?: boolean;
  onClose?: () => void;
}

/** Format a 0-1 probability as a percentage. */
function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}`;
}

/** Format equity with sign. */
function formatEquity(v: number | null | undefined): string {
  if (v == null) return "—";
  return v >= 0 ? `+${v.toFixed(3)}` : v.toFixed(3);
}

/** Win probability bar segment. */
function WinBar({
  w, wg, wbg, lbg, lg, l,
}: {
  w: number; wg: number; wbg: number;
  lbg: number; lg: number; l: number;
}) {
  const segments: [number, string, string][] = [
    [w, "ddp-seg-w", "W"],
    [wg, "ddp-seg-wg", "g"],
    [wbg, "ddp-seg-wbg", "bg"],
    [lbg, "ddp-seg-lbg", "bg"],
    [lg, "ddp-seg-lg", "g"],
    [l, "ddp-seg-l", "L"],
  ];

  return (
    <div className="ddp-winbar">
      <div className="ddp-winbar-track">
        {segments.map(([value, cls, label], i) =>
          value > 0 ? (
            <div
              key={i}
              className={`ddp-winbar-seg ${cls}`}
              style={{ flexBasis: `${value}%` }}
            >
              {value >= 6 ? `${value.toFixed(0)}` : ""}
            </div>
          ) : null,
        )}
      </div>
      <div className="ddp-winbar-legend">
        <span><span className="ddp-sw" style={{ background: "#e8dcb4" }} />Win {(w + wg + wbg).toFixed(1)}%</span>
        <span><span className="ddp-sw" style={{ background: "#c69b3a" }} />Gammon {(wg + wbg).toFixed(1)}%</span>
        <span><span className="ddp-sw" style={{ background: "#190707" }} />Lose {(l + lg + lbg).toFixed(1)}%</span>
      </div>
    </div>
  );
}

export default function DeepDivePanel({
  data,
  playedNotation,
  compact = false,
  onClose,
}: DeepDivePanelProps) {
  // Convert probabilities from 0-1 to percentages for the bar.
  const winPct = (data.win_prob ?? 0) * 100;
  const winGPct = (data.win_g_prob ?? 0) * 100;
  const winBgPct = (data.win_bg_prob ?? 0) * 100;
  const losePct = (data.lose_prob ?? 0) * 100;
  const loseGPct = (data.lose_g_prob ?? 0) * 100;
  const loseBgPct = (data.lose_bg_prob ?? 0) * 100;

  // Win% bar segments: Win-only, Win-gammon, Win-bg, Lose-bg, Lose-gammon, Lose-only
  const wOnly = Math.max(0, winPct - winGPct);
  const wgOnly = Math.max(0, winGPct - winBgPct);
  const lOnly = Math.max(0, losePct - loseGPct);
  const lgOnly = Math.max(0, loseGPct - loseBgPct);

  const playerColor = data.player_color;

  return (
    <div className="ddp">
      <div className="ddp-head">
        <div className="ddp-head-left">
          <span className="ddp-eyebrow">
            Position deep-dive &middot; {data.ply}-ply
          </span>
          <h4 className="ddp-title">
            Move {data.move_number} &middot;{" "}
            {playerColor === "white" ? "White" : "Black"} rolled {data.dice_roll}
          </h4>
        </div>
        <div className="ddp-head-right">
          <span className="ddp-badge-gold">Maximum depth</span>
          {onClose && (
            <button className="ddp-close" onClick={onClose} aria-label="Close deep-dive">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="ddp-body">
        {/* Win probability bar */}
        {data.win_prob != null && (
          <div>
            <div className="ddp-section-header">
              <span className="ddp-section-title">Cubeless win probabilities</span>
            </div>
            <WinBar
              w={wOnly}
              wg={wgOnly}
              wbg={winBgPct}
              lbg={loseBgPct}
              lg={lgOnly}
              l={lOnly}
            />
          </div>
        )}

        {/* Equity cells */}
        <div className="ddp-equity-grid">
          <div className="ddp-equity-cell ddp-equity-cell--accent">
            <span className="ddp-equity-k">Cubeless equity</span>
            <span className="ddp-equity-v">{formatEquity(data.cubeless_equity)}</span>
            <span className="ddp-equity-sub">
              Mover&apos;s perspective ({playerColor === "white" ? "White" : "Black"})
            </span>
          </div>
          <div className="ddp-equity-cell">
            <span className="ddp-equity-k">Cubeful equity</span>
            <span className="ddp-equity-v">{formatEquity(data.cubeful_equity)}</span>
          </div>
        </div>

        {/* Top candidate moves */}
        {data.top_moves.length > 0 && (
          <div>
            <div className="ddp-section-header">
              <span className="ddp-section-title">Top candidate moves</span>
              <span className="ddp-section-meta">
                {data.top_moves.length} evaluated
              </span>
            </div>
            <table className="ddp-candidates">
              <thead>
                <tr>
                  <th></th>
                  <th>Move</th>
                  <th className="ddp-num">Equity</th>
                  <th className="ddp-num">{"\u0394"} vs best</th>
                  <th className="ddp-num">Win %</th>
                </tr>
              </thead>
              <tbody>
                {data.top_moves.map((candidate: MoveCandidate) => {
                  const isBest = candidate.rank === 1;
                  const isPlayed =
                    candidate.notation === playedNotation ||
                    (isBest &&
                      candidate.notation ===
                        data.top_moves[0]?.notation);
                  return (
                    <tr
                      key={candidate.rank}
                      className={`${isBest ? "ddp-row-best" : ""}${isPlayed ? " ddp-row-played" : ""}`}
                    >
                      <td className={`ddp-rank${isBest ? " ddp-rank-1" : ""}`}>
                        {candidate.rank}
                      </td>
                      <td className="ddp-move-notation">
                        {notationToPlayerPerspective(candidate.notation, playerColor)}
                        {isPlayed && (
                          <span className="ddp-played-badge">Played</span>
                        )}
                      </td>
                      <td className="ddp-num">{formatEquity(candidate.equity)}</td>
                      <td
                        className={`ddp-num ddp-delta${
                          candidate.equity_diff < -0.1
                            ? " ddp-delta--bad"
                            : candidate.equity_diff < -0.04
                              ? " ddp-delta--warn"
                              : ""
                        }`}
                      >
                        {candidate.rank === 1
                          ? "\u2014"
                          : candidate.equity_diff.toFixed(3)}
                      </td>
                      <td className="ddp-num">
                        {candidate.probs?.win != null
                          ? `${pct(candidate.probs.win)}%`
                          : "\u2014"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Cube decision */}
        {!compact && data.cube_decision && (
          <div>
            <div className="ddp-section-header">
              <span className="ddp-section-title">Cube decision</span>
            </div>
            <div className="ddp-cube-grid">
              <div className="ddp-cube-cell ddp-cube-cell--recommend">
                <div className="ddp-cube-label">
                  <span className="ddp-cube-k">
                    Action &middot; {playerColor === "white" ? "White" : "Black"}
                  </span>
                  <span className="ddp-cube-v">{data.cube_decision.action}</span>
                </div>
                {data.cube_decision.equity_no_double != null && (
                  <span className="ddp-cube-eq">
                    {formatEquity(data.cube_decision.equity_no_double)}
                  </span>
                )}
              </div>
              {data.cube_decision.equity_double_take != null && (
                <div className="ddp-cube-cell">
                  <div className="ddp-cube-label">
                    <span className="ddp-cube-k">If doubled</span>
                    <span className="ddp-cube-v">
                      Take &middot; {formatEquity(data.cube_decision.equity_double_take)}
                    </span>
                  </div>
                  {data.cube_decision.equity_double_drop != null && (
                    <span className="ddp-cube-eq">
                      drop: {formatEquity(data.cube_decision.equity_double_drop)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="ddp-foot">
        <span className="ddp-foot-meta">
          gnubg &middot; {data.ply}-ply
          {data.analysis_time_ms != null && (
            <> &middot; {(data.analysis_time_ms / 1000).toFixed(1)}s</>
          )}
        </span>
      </div>
    </div>
  );
}
