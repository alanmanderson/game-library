/**
 * GameReplay component – step-by-step replay of a completed backgammon game.
 *
 * Fetches replay data (initial state + per-move board snapshots) from the
 * backend and lets the user navigate forward/backward through the moves,
 * or watch the game play out automatically.
 *
 * Public sharing: the route is accessible without authentication.  A
 * "Copy Share Link" button puts the canonical replay URL on the clipboard,
 * and an ?embed=1 query param hides chrome (header + back button) so the
 * viewer can be embedded on external sites.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import type {
  AnalysisData,
  DeepDiveResult,
  GameState,
  MoveAnalysis,
  MoveProbs,
  MoveQuality,
  ReplayData,
  ReplayMoveRecord,
} from "../types/game";
import { getAnalysis, getPositionDeepDive, getReplay } from "../services/api";
import Board from "./Board";
import Dice from "./Dice";
import ReanalyzeModal from "./ReanalyzeModal";
import DeepDivePanel from "./DeepDivePanel";
import { STORAGE_KEY } from "../constants";
import { parseMovesNotationRaw, notationToPlayerPerspective } from "../utils/notation";
import "./styles/GameReplay.css";

/** Read the logged-in player from localStorage, if present. */
function readStoredPlayerId(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.id === "string" ? parsed.id : null;
  } catch {
    return null;
  }
}

/**
 * Display label for each move-quality level.
 *
 * Uses a 5-tier system: Best, Good, Doubtful, Mistake, Blunder.
 * The old "inaccuracy" label maps to "Doubtful"; gnubg-native labels
 * (`very_good`, `bad`, `very_bad`) map to the closest tier.
 */
const QUALITY_LABEL: Record<MoveQuality, string> = {
  best: "Best",
  good: "Good",
  inaccuracy: "Doubtful",
  mistake: "Mistake",
  blunder: "Blunder",
  very_good: "Best",
  doubtful: "Doubtful",
  bad: "Mistake",
  very_bad: "Blunder",
};

/**
 * Map every quality label to a CSS colour class matching the 5-tier system:
 * best (gold), good (green), doubtful (amber), mistake (orange), blunder (red).
 */
const QUALITY_CSS_CLASS: Record<MoveQuality, string> = {
  best: "best",
  good: "good",
  inaccuracy: "doubtful",
  mistake: "mistake",
  blunder: "blunder",
  very_good: "best",
  doubtful: "doubtful",
  bad: "mistake",
  very_bad: "blunder",
};

/**
 * Normalise move notation for comparison: strip hit markers, collapse
 * chains (``20/14/8`` → ``20/8``), and sort so move order doesn't
 * matter (e.g. "18/13 24/20" matches "24/20 18/13" and
 * "13/7 13/7 20/14/8" matches "20/8 13/7 13/7").
 */
function normaliseNotation(s: string): string {
  const segments = s.replace(/\*/g, "").trim().split(/\s+/);
  const collapsed: string[] = [];
  for (const seg of segments) {
    const parts = seg.split("/");
    if (parts.length >= 2) {
      collapsed.push(`${parts[0]}/${parts[parts.length - 1]}`);
    }
  }
  return collapsed.sort().join(" ");
}

/** Classify a candidate move's quality based on its equity delta from best. */
function classifyDelta(delta: number): string {
  const d = Math.abs(delta);
  if (d < 0.005) return "best";
  if (d < 0.040) return "good";
  if (d < 0.080) return "doubtful";
  if (d < 0.160) return "mistake";
  return "blunder";
}

/** CSS class for the equity delta text colour. */
function deltaClass(delta: number): string {
  const d = Math.abs(delta);
  if (d < 0.040) return "";
  if (d < 0.080) return "warn";
  if (d < 0.160) return "bad";
  return "blunder";
}

/** Format equity with sign prefix. */
function formatEq(e: number): string {
  return (e >= 0 ? "+" : "") + e.toFixed(3);
}

/** Format delta: 0 → "best", otherwise signed number. */
function formatDelta(d: number): string {
  if (Math.abs(d) < 0.001) return "best";
  return (d > 0 ? "+" : "") + d.toFixed(3);
}

/** Classify luck value into a tier. */
type LuckTier = "very_lucky" | "lucky" | "none" | "unlucky" | "very_unlucky";
function classifyLuck(luck: number): LuckTier {
  if (luck > 0.06) return "very_lucky";
  if (luck > 0.02) return "lucky";
  if (luck > -0.02) return "none";
  if (luck > -0.06) return "unlucky";
  return "very_unlucky";
}

/** Format luck value with sign. */
function formatLuck(luck: number): string {
  return (luck >= 0 ? "+" : "") + luck.toFixed(3);
}

/** Luck pill: clover + numeric luck value. */
function LuckPill({ luck }: { luck: number }) {
  const tier = classifyLuck(luck);
  if (tier === "none") return null;
  return (
    <span className={`luck-pill luck-pill--${tier}`} title={`Dice luck: ${formatLuck(luck)}`}>
      {"\u2618"}{formatLuck(luck)}
    </span>
  );
}

/** Per-move luck data. */
interface MoveLuck {
  move_number: number;
  player_color: "white" | "black";
  luck: number;
}

/** Quality chip: small coloured dot indicator. */
function QualityChip({ quality }: { quality: string }) {
  const cssQ = QUALITY_CSS_CLASS[quality as MoveQuality] ?? quality;
  return <span className={`qdot qdot--${cssQ}`} title={QUALITY_LABEL[quality as MoveQuality] ?? quality} />;
}

/** Equity bar: horizontal track showing equity relative to the best move. */
function EquityBar({ delta, quality, max = 0.230 }: { delta: number; quality: string; max?: number }) {
  const ratio = Math.max(0, 1 - Math.abs(delta) / max);
  const width = `${(ratio * 100).toFixed(1)}%`;
  const cssQ = QUALITY_CSS_CLASS[quality as MoveQuality] ?? quality;
  return (
    <div className="equity-track">
      <div className={`equity-fill equity-fill--${cssQ}`} style={{ width }} />
    </div>
  );
}

/** Format a 0..1 probability as a percentage with one decimal place. */
function formatPct(p: number | null | undefined): string | null {
  if (p === null || p === undefined || Number.isNaN(p)) return null;
  const clamped = Math.max(0, Math.min(1, p));
  return `${(clamped * 100).toFixed(1)}%`;
}

/** Parse a dice_roll string like "3-5" into { die1, die2 }. */
function parseDiceRoll(diceRoll: string): { die1: number; die2: number } | null {
  const parts = diceRoll.split("-");
  if (parts.length !== 2) return null;
  const die1 = parseInt(parts[0], 10);
  const die2 = parseInt(parts[1], 10);
  if (isNaN(die1) || isNaN(die2)) return null;
  return { die1, die2 };
}

/** Build a display-ready GameState for replay by filling in missing fields. */
function buildReplayState(state: GameState, move: ReplayMoveRecord | null): GameState {
  const dice = move ? parseDiceRoll(move.dice_roll) : null;
  return {
    ...state,
    valid_moves: [],
    dice: dice ?? null,
    remaining_dice: [],
  };
}

/** Build a one-line description of the result for OG/description tags. */
function buildReplayDescription(data: ReplayData): string {
  const white = data.white_player_nickname ?? "White";
  const black = data.black_player_nickname ?? "Black";
  if (data.winner_nickname && data.win_type) {
    const loser =
      data.winner_color === "white" ? black : data.winner_color === "black" ? white : "opponent";
    const typeLabel =
      data.win_type === "backgammon"
        ? "backgammon"
        : data.win_type === "gammon"
          ? "gammon"
          : "win";
    const score =
      data.white_match_score != null && data.black_match_score != null
        ? ` (${data.white_match_score}-${data.black_match_score})`
        : "";
    return `${data.winner_nickname} defeated ${loser} by ${typeLabel}${score}.`;
  }
  return `A backgammon match between ${white} and ${black}.`;
}

/** Set (or update) a meta tag in document.head. */
function setMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    for (const [k, v] of Object.entries(attrs)) {
      if (k !== "content") el.setAttribute(k, v);
    }
    document.head.appendChild(el);
  }
  if (attrs.content !== undefined) {
    el.setAttribute("content", attrs.content);
  }
}

/**
 * Compact grid showing the win / gammon / backgammon probability breakdown
 * for the chosen move and the engine's best move.
 */
function MoveProbsBreakdown({
  chosen,
  best,
}: {
  chosen: MoveProbs | null;
  best: MoveProbs | null;
}) {
  const rows: { key: keyof MoveProbs; label: string }[] = [
    { key: "win", label: "Win" },
    { key: "win_g", label: "Win (gammon)" },
    { key: "lose_g", label: "Lose (gammon)" },
    { key: "win_bg", label: "Win (bg)" },
    { key: "lose_bg", label: "Lose (bg)" },
  ];
  return (
    <div className="replay-move-probs-breakdown" role="table">
      <div className="replay-move-probs-breakdown-header" role="row">
        <span role="columnheader" />
        <span role="columnheader">Chosen</span>
        <span role="columnheader">Best</span>
      </div>
      {rows.map(({ key, label }) => {
        const c = formatPct(chosen?.[key]);
        const b = formatPct(best?.[key]);
        return (
          <div
            key={key}
            className="replay-move-probs-breakdown-row"
            role="row"
          >
            <span role="rowheader" className="replay-move-probs-breakdown-label">
              {label}
            </span>
            <span role="cell" className="replay-move-probs-breakdown-value">
              {c ?? "—"}
            </span>
            <span role="cell" className="replay-move-probs-breakdown-value">
              {b ?? "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function GameReplay() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const embed = searchParams.get("embed") === "1";

  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Current position in the replay (0 = initial state, N = after move N)
  const [moveIndex, setMoveIndex] = useState(0);

  // Auto-play state
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1500); // ms between moves
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Analysis panel state (always visible in replay)
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  /** Polling interval for background 3-ply analysis. */
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Move numbers whose details panel (gammon/bg breakdown) is expanded. */
  const [expandedMoves, setExpandedMoves] = useState<Set<number>>(new Set());
  /** Index into currentAnalysis.top_moves of the candidate being previewed. */
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  /** gnubg evaluation depth: 0 (fast), 2 (standard), 3 (deep/slow). */
  const [analysisPly, setAnalysisPly] = useState<0 | 2 | 3>(2);

  /** Color filter for stepping through moves: only step through white, black, or both. */
  type ColorFilter = "white" | "black" | "both";
  const [colorFilter, setColorFilter] = useState<ColorFilter>("both");

  // Re-analyze modal state
  const [showReanalyzeModal, setShowReanalyzeModal] = useState(false);

  // Deep-dive state
  const [deepDiveData, setDeepDiveData] = useState<DeepDiveResult | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [deepDiveMoveNumber, setDeepDiveMoveNumber] = useState<number | null>(null);

  // Speed slider constants: the slider is inverted so right = faster.
  // Slider range is [SPEED_SLIDER_MIN, SPEED_SLIDER_MAX]; actual delay = SPEED_OFFSET - sliderValue.
  const SPEED_MIN_MS = 300;
  const SPEED_MAX_MS = 3000;
  const SPEED_OFFSET = SPEED_MIN_MS + SPEED_MAX_MS; // 3300

  useEffect(() => {
    if (!tableId) return;
    let cancelled = false;

    async function fetchReplay() {
      setLoading(true);
      setError(null);
      try {
        const data = await getReplay(tableId!);
        if (!cancelled) {
          setReplayData(data);
          setMoveIndex(0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load replay.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchReplay();
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  // Populate document.title and OG/Twitter meta tags once the replay is loaded.
  // Note: this is a client-side SPA so headless crawlers that don't run JS
  // won't see these tags.  Slack/iMessage/Discord do execute JS previews for
  // many links, so this gives a best-effort preview for the common case.
  useEffect(() => {
    if (!replayData) return;
    const title = `Backgammon replay: ${replayData.white_player_nickname ?? "White"} vs ${replayData.black_player_nickname ?? "Black"}`;
    const description = buildReplayDescription(replayData);
    const url =
      typeof window !== "undefined" ? `${window.location.origin}/replay/${replayData.table_id}` : "";

    const previousTitle = document.title;
    document.title = title;

    setMeta('meta[property="og:title"]', { property: "og:title", content: title });
    setMeta('meta[property="og:description"]', { property: "og:description", content: description });
    setMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    if (url) {
      setMeta('meta[property="og:url"]', { property: "og:url", content: url });
    }
    setMeta('meta[name="description"]', { name: "description", content: description });
    setMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary" });
    setMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
    setMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });

    return () => {
      document.title = previousTitle;
    };
  }, [replayData]);

  // Stop auto-play and analysis polling when the component unmounts
  useEffect(() => {
    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const totalMoves = replayData ? replayData.moves.length : 0;

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, totalMoves));
      setMoveIndex(clamped);
    },
    [totalMoves],
  );

  // Helper: determine a move's color from its player_nickname.
  const getMoveColor = useCallback(
    (move: ReplayMoveRecord): "white" | "black" =>
      move.player_nickname === replayData?.white_player_nickname ? "white" : "black",
    [replayData],
  );

  // Filtered move indices for stepping (null = no filter / show all).
  const filteredMoveIndices = useMemo<number[] | null>(() => {
    if (!replayData || colorFilter === "both") return null;
    const indices: number[] = [0]; // always include starting position
    for (let i = 0; i < replayData.moves.length; i++) {
      if (getMoveColor(replayData.moves[i]) === colorFilter) {
        indices.push(i + 1); // moveIndex is 1-based
      }
    }
    return indices;
  }, [replayData, colorFilter, getMoveColor]);

  // Filtered navigation helpers.
  const goToNextFiltered = useCallback(() => {
    if (!filteredMoveIndices) { goTo(moveIndex + 1); return; }
    const next = filteredMoveIndices.find((i) => i > moveIndex);
    if (next !== undefined) goTo(next);
  }, [moveIndex, filteredMoveIndices, goTo]);

  const goToPrevFiltered = useCallback(() => {
    if (!filteredMoveIndices) { goTo(moveIndex - 1); return; }
    for (let i = filteredMoveIndices.length - 1; i >= 0; i--) {
      if (filteredMoveIndices[i] < moveIndex) { goTo(filteredMoveIndices[i]); return; }
    }
  }, [moveIndex, filteredMoveIndices, goTo]);

  const isAtFilteredEnd = useMemo(() => {
    if (!filteredMoveIndices) return moveIndex >= totalMoves;
    return !filteredMoveIndices.some((i) => i > moveIndex);
  }, [moveIndex, totalMoves, filteredMoveIndices]);

  const isAtFilteredStart = useMemo(() => {
    if (!filteredMoveIndices) return moveIndex === 0;
    return !filteredMoveIndices.some((i) => i < moveIndex);
  }, [moveIndex, filteredMoveIndices]);

  const stopAutoPlay = useCallback(() => {
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
    setAutoPlaying(false);
  }, []);

  const startAutoPlay = useCallback(() => {
    if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    setAutoPlaying(true);
    autoPlayRef.current = setInterval(() => {
      setMoveIndex((prev) => {
        if (!filteredMoveIndices) {
          const next = prev + 1;
          if (next >= totalMoves) { stopAutoPlay(); return totalMoves; }
          return next;
        }
        const next = filteredMoveIndices.find((i) => i > prev);
        if (next === undefined) { stopAutoPlay(); return prev; }
        return next;
      });
    }, playSpeed);
  }, [playSpeed, totalMoves, stopAutoPlay, filteredMoveIndices]);

  // Restart timer when speed changes while auto-playing
  useEffect(() => {
    if (autoPlaying) {
      startAutoPlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSpeed]);

  // Stop auto-play when reaching the filtered end
  useEffect(() => {
    if (autoPlaying && isAtFilteredEnd) {
      stopAutoPlay();
    }
  }, [autoPlaying, isAtFilteredEnd, stopAutoPlay]);

  // Reset selected candidate when the viewed move changes.
  useEffect(() => setSelectedCandidate(null), [moveIndex]);

  // Arrow-key navigation: left = previous move, right = next move.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stopAutoPlay();
        goToPrevFiltered();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stopAutoPlay();
        goToNextFiltered();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNextFiltered, goToPrevFiltered, stopAutoPlay]);

  /** Stop any active analysis poll. */
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  /** Start 60-second polling for background analysis progress. */
  const startPolling = useCallback((ply: number) => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      if (!tableId) return;
      try {
        const updated = await getAnalysis(tableId, 100, ply);
        setAnalysis(updated);
        if (updated.status !== "running") {
          stopPolling();
          setAnalysisLoading(false);
        }
      } catch {
        // Don't stop polling on transient network errors
      }
    }, 60_000);
  }, [tableId, stopPolling]);

  const fetchAnalysis = useCallback(async (ply: number, force = false) => {
    if (!tableId) return;
    if (!force && analysis && (analysis.analysis_ply ?? 2) === ply
        && analysis.status !== "failed") return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    stopPolling();
    try {
      const data = await getAnalysis(tableId, 100, ply);
      setAnalysis(data);
      if (data.status === "running") {
        // Keep loading state and start polling every 60s
        startPolling(ply);
      } else {
        setAnalysisLoading(false);
      }
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "Failed to load analysis.",
      );
      setAnalysisLoading(false);
    }
  }, [analysis, tableId, stopPolling, startPolling]);

  // Fetch analysis as soon as the replay loads.
  useEffect(() => {
    if (!replayData) return;
    fetchAnalysis(analysisPly);
  }, [replayData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand: when analysis finishes, navigate to move 1 and expand its details.
  const hasAutoExpanded = useRef(false);
  useEffect(() => {
    if (hasAutoExpanded.current) return;
    if (!analysis || analysis.status === "running") return;
    if (analysis.move_analyses.length === 0) return;
    hasAutoExpanded.current = true;
    const firstMove = analysis.move_analyses[0].move_number;
    goTo(firstMove);
    setExpandedMoves(new Set([firstMove]));
  }, [analysis, goTo]);

  // Re-fetch when ply changes.
  const handlePlyChange = useCallback((newPly: 0 | 2 | 3) => {
    stopPolling();
    setAnalysisPly(newPly);
    setAnalysis(null);
    fetchAnalysis(newPly, true);
  }, [fetchAnalysis, stopPolling]);

  // Analysis is always visible - no toggle needed.

  /** Re-analyze with force flag. */
  const handleReanalyze = useCallback(async (ply: 0 | 2 | 3) => {
    setShowReanalyzeModal(false);
    stopPolling();
    setAnalysisPly(ply);
    setAnalysis(null);
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const data = await getAnalysis(tableId!, 100, ply, true);
      setAnalysis(data);
      if (data.status === "running") {
        startPolling(ply);
      } else {
        setAnalysisLoading(false);
      }
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "Failed to start re-analysis.",
      );
      setAnalysisLoading(false);
    }
  }, [tableId, stopPolling, startPolling]);

  /** Deep-dive: fetch maximum-depth analysis for a single position. */
  const handleDeepDive = useCallback(async (moveNumber: number) => {
    if (!tableId) return;
    // Toggle off if clicking the same move.
    if (deepDiveMoveNumber === moveNumber && deepDiveData) {
      setDeepDiveData(null);
      setDeepDiveMoveNumber(null);
      return;
    }
    setDeepDiveMoveNumber(moveNumber);
    setDeepDiveLoading(true);
    setDeepDiveData(null);
    try {
      const data = await getPositionDeepDive(tableId, moveNumber);
      setDeepDiveData(data);
    } catch {
      setDeepDiveData(null);
    } finally {
      setDeepDiveLoading(false);
    }
  }, [tableId, deepDiveMoveNumber, deepDiveData]);

  /** Close deep-dive panel. */
  const handleCloseDeepDive = useCallback(() => {
    setDeepDiveData(null);
    setDeepDiveMoveNumber(null);
  }, []);

  /** Top-3 key moments: moves with the largest equity_loss. */
  const keyMoments = useMemo<MoveAnalysis[]>(() => {
    if (!analysis) return [];
    return [...analysis.move_analyses]
      .sort((a, b) => b.equity_loss - a.equity_loss)
      .slice(0, 3)
      .filter((m) => m.equity_loss > 0);
  }, [analysis]);

  /**
   * Source label for the analysis banner. We consider the analysis to be
   * "gnubg-sourced" if any move row declares it — mixed responses fall back
   * to the existing behaviour (ml_available banner only).
   */
  const analysisSource = useMemo<"gnubg" | "ml" | "heuristic" | null>(() => {
    if (!analysis) return null;
    for (const m of analysis.move_analyses) {
      if (m.source === "gnubg") return "gnubg";
    }
    // Fall back to the first non-null source we see.
    for (const m of analysis.move_analyses) {
      if (m.source) return m.source;
    }
    return null;
  }, [analysis]);

  /** Per-player summary: quality distribution + error rate. */
  const playerSummaries = useMemo(() => {
    if (!analysis) return null;
    const colors = ["white", "black"] as const;
    const summaries: Record<
      string,
      {
        nickname: string;
        totalMoves: number;
        totalEquityLoss: number;
        qualityCounts: Record<string, number>;
      }
    > = {};
    for (const c of colors) {
      summaries[c] = {
        nickname: c === "white"
          ? (replayData?.white_player_nickname ?? "White")
          : (replayData?.black_player_nickname ?? "Black"),
        totalMoves: 0,
        totalEquityLoss: 0,
        qualityCounts: {},
      };
    }
    for (const m of analysis.move_analyses) {
      const s = summaries[m.player_color];
      if (!s) continue;
      s.totalMoves++;
      s.totalEquityLoss += m.equity_loss;
      const label = QUALITY_LABEL[m.quality] ?? m.quality;
      s.qualityCounts[label] = (s.qualityCounts[label] ?? 0) + 1;
    }
    return summaries;
  }, [analysis, replayData]);

  // ── Luck computation ──────────────────────────────────────────────────
  // luck = best_equity_with_dice - expected_equity_before_roll
  // expected_equity_before_roll ≈ -(equity_after of previous move)
  const luckData = useMemo<MoveLuck[]>(() => {
    if (!analysis?.move_analyses?.length) return [];
    const moves = analysis.move_analyses;
    return moves.map((m, i) => {
      const prevEquityAfter = i > 0 ? moves[i - 1].equity_after : 0;
      const luck = m.best_equity - (-prevEquityAfter);
      return { move_number: m.move_number, player_color: m.player_color, luck };
    });
  }, [analysis]);

  const luckByMove = useMemo(() => {
    const map = new Map<number, number>();
    for (const l of luckData) map.set(l.move_number, l.luck);
    return map;
  }, [luckData]);

  // Per-player total luck for the game summary.
  const luckSummary = useMemo(() => {
    const totals: Record<string, number> = { white: 0, black: 0 };
    for (const l of luckData) totals[l.player_color] = (totals[l.player_color] ?? 0) + l.luck;
    return totals;
  }, [luckData]);

  // ── Win probability series for chart ──────────────────────────────────
  // Track white's win probability throughout the game.
  const winProbSeries = useMemo<{ move: number; whiteWin: number }[]>(() => {
    if (!analysis?.move_analyses?.length) return [];
    return analysis.move_analyses
      .filter((m) => m.chosen_win_prob != null || m.chosen_probs?.win != null)
      .map((m) => {
        const p = m.chosen_win_prob ?? m.chosen_probs?.win ?? 0.5;
        // chosen_win_prob is from the mover's perspective. Normalise to white's POV.
        const whiteWin = m.player_color === "white" ? p : 1 - p;
        return { move: m.move_number, whiteWin };
      });
  }, [analysis]);

  // Orient the board to the logged-in player's perspective when they were
  // one of the two seats. Fall back to white for spectators/unauthed viewers.
  const storedPlayerId = useMemo(() => readStoredPlayerId(), []);
  const viewColor: "white" | "black" =
    storedPlayerId && replayData?.black_player_id === storedPlayerId
      ? "black"
      : "white";

  // Default the color filter to the logged-in player's color once replay loads.
  useEffect(() => {
    if (!replayData || !storedPlayerId) return;
    if (replayData.white_player_id === storedPlayerId) setColorFilter("white");
    else if (replayData.black_player_id === storedPlayerId) setColorFilter("black");
  }, [replayData, storedPlayerId]);

  // Analysis entry for the move we just reached (moveIndex === move_number).
  const currentAnalysis = useMemo<MoveAnalysis | null>(() => {
    if (!analysis || moveIndex === 0) return null;
    return (
      analysis.move_analyses.find((m) => m.move_number === moveIndex) ?? null
    );
  }, [analysis, moveIndex]);

  const currentWinPct = currentAnalysis
    ? formatPct(
        currentAnalysis.chosen_win_prob ?? currentAnalysis.chosen_probs?.win,
      )
    : null;

  // Compute the max equity loss across candidates for the equity bar scale.
  const equityBarMax = useMemo(() => {
    if (!currentAnalysis?.top_moves?.length) return 0.230;
    const maxDelta = Math.max(
      ...currentAnalysis.top_moves.map((c) => Math.abs(c.equity_diff)),
      0.05, // floor so the best-move bar doesn't look trivially narrow
    );
    return maxDelta;
  }, [currentAnalysis]);

  // Pre-compute best-move arrows (must be a hook, so placed before early returns).
  // Arrows that exactly match a chosen-move arrow are filtered to prevent overlap.
  const bestMoveArrowsComputed = useMemo(() => {
    if (
      !currentAnalysis ||
      !currentAnalysis.best_move_notation ||
      currentAnalysis.quality === "best" ||
      currentAnalysis.quality === "very_good"
    )
      return undefined;
    const best = parseMovesNotationRaw(currentAnalysis.best_move_notation);
    // We need the chosen notation from the current move.
    const chosenNotation =
      replayData && moveIndex > 0
        ? replayData.moves[moveIndex - 1]?.moves_notation
        : null;
    if (!chosenNotation) return best;
    const chosen = parseMovesNotationRaw(chosenNotation);
    const chosenKeys = new Set(chosen.map((a) => `${a.from}/${a.to}`));
    const filtered = best.filter((a) => !chosenKeys.has(`${a.from}/${a.to}`));
    return filtered.length > 0 ? filtered : undefined;
  }, [currentAnalysis, replayData, moveIndex]);

  const toggleMoveDetails = useCallback((moveNumber: number) => {
    setExpandedMoves((prev) => {
      const next = new Set(prev);
      if (next.has(moveNumber)) next.delete(moveNumber);
      else next.add(moveNumber);
      return next;
    });
  }, []);

  const handleCopyShareLink = useCallback(async () => {
    if (!tableId) return;
    const shareUrl = `${window.location.origin}/replay/${tableId}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        // Fallback for older browsers / insecure contexts
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [tableId]);

  if (loading) {
    return (
      <div className={`replay-page${embed ? " replay-page--embed" : ""}`}>
        <div className="replay-loading">Loading replay…</div>
      </div>
    );
  }

  if (error || !replayData) {
    return (
      <div className={`replay-page${embed ? " replay-page--embed" : ""}`}>
        <div className="replay-error">{error ?? "Replay not available."}</div>
        {!embed && (
          <button className="replay-back-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
        )}
      </div>
    );
  }

  // Determine current board state
  const currentMove: ReplayMoveRecord | null =
    moveIndex > 0 ? replayData.moves[moveIndex - 1] : null;

  const rawState: GameState =
    moveIndex === 0
      ? replayData.initial_state
      : (currentMove?.game_state_after ?? replayData.initial_state);

  const displayState = buildReplayState(rawState, currentMove);

  // Determine the color whose turn it was for this move (who just moved)
  const movedBy = currentMove?.player_nickname ?? null;
  const movedByColor =
    currentMove && replayData.white_player_nickname === currentMove.player_nickname
      ? "white"
      : "black";

  const cubeValue = displayState.cube_value ?? 1;
  const cubeOwner = displayState.cube_owner ?? null;

  // Yellow arrows showing the actual move — one arrow per die use.
  const moveArrows = currentMove
    ? parseMovesNotationRaw(currentMove.moves_notation)
    : undefined;

  const bestMoveArrows = bestMoveArrowsComputed;

  // When a candidate row is selected in the top-moves panel, show that
  // candidate's arrows instead of the chosen/best move arrows.
  const displayMoveArrows = (() => {
    if (selectedCandidate !== null && currentAnalysis?.top_moves) {
      const candidate = currentAnalysis.top_moves[selectedCandidate];
      if (candidate) {
        return parseMovesNotationRaw(candidate.notation);
      }
    }
    return moveArrows;
  })();

  const displayBestMoveArrows = selectedCandidate !== null ? undefined : bestMoveArrows;

  // Dice to show on the board: parsed from the current move record. For moves
  // other than the very first, both dice belong to the same player; for move
  // 1 we reconstruct the opening roll so each die is coloured by who rolled
  // it. The first mover always rolled the higher value, so we can infer both
  // players' rolls from the dice and the first mover's colour.
  const replayDice = displayState.dice;
  const openingRoll =
    moveIndex === 1 && replayDice && replayDice.die1 !== replayDice.die2
      ? {
          white:
            movedByColor === "white"
              ? Math.max(replayDice.die1, replayDice.die2)
              : Math.min(replayDice.die1, replayDice.die2),
          black:
            movedByColor === "black"
              ? Math.max(replayDice.die1, replayDice.die2)
              : Math.min(replayDice.die1, replayDice.die2),
        }
      : null;
  const remainingDiceForDisplay = replayDice
    ? replayDice.die1 === replayDice.die2
      ? [replayDice.die1, replayDice.die1, replayDice.die1, replayDice.die1]
      : [replayDice.die1, replayDice.die2]
    : [];

  // Dice values for the panel display.
  const diceValues = currentMove ? parseDiceRoll(currentMove.dice_roll) : null;

  return (
    <div className={`replay-page${embed ? " replay-page--embed" : ""}`}>
      {/* Header (hidden in embed mode) */}
      {!embed && (
        <div className="replay-header">
          <button className="replay-back-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <h2 className="replay-title">
            {replayData.white_player_nickname ?? "White"} vs{" "}
            {replayData.black_player_nickname ?? "Black"}
          </h2>
          <div className="replay-header-actions">
            {analysis?.status === "running" ? (
              <button
                type="button"
                className="replay-reanalyze-btn replay-reanalyze-btn--running"
                disabled
              >
                <span className="replay-reanalyze-spin" />
                Re-analyzing &middot; {analysis.progress != null ? `${Math.round(analysis.progress * 100)}%` : "..."}
              </button>
            ) : (
              <button
                type="button"
                className="replay-reanalyze-btn"
                onClick={() => setShowReanalyzeModal(true)}
                title="Re-analyze this game with different settings"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2v4h-4"/>
                  <path d="M2 14v-4h4"/>
                  <path d="M13.5 6A6 6 0 0 0 3.4 4.4M2.5 10a6 6 0 0 0 10.1 1.6"/>
                </svg>
                Re-analyze
              </button>
            )}
            <button
              type="button"
              className={`replay-share-btn${copied ? " replay-share-btn--copied" : ""}`}
              onClick={handleCopyShareLink}
              aria-label="Copy share link"
              title="Copy a public link to this replay"
            >
              {copied ? "✓ Copied!" : "🔗 Share"}
            </button>
          </div>
        </div>
      )}

      {/* Navigation bar with breadcrumb + move controls */}
      {!embed && (
        <div className="replay-nav-bar">
          <div className="replay-nav-breadcrumb">
            <span className="move-label replay-counter">
              {moveIndex === 0
                ? "Starting position"
                : <>Move <strong>{moveIndex}</strong> of <strong>{totalMoves}</strong></>}
            </span>
          </div>
          <div className="replay-nav-buttons">
            <button className="nav-btn" onClick={() => { stopAutoPlay(); goTo(0); }} disabled={isAtFilteredStart} title="First move" aria-label="Go to first move">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12.5L6 8l6-4.5"/><path d="M4 3.5v9"/></svg>
            </button>
            <button className="nav-btn" onClick={() => { stopAutoPlay(); goToPrevFiltered(); }} disabled={isAtFilteredStart} title="Previous move" aria-label="Previous move">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12.5L4 8l6-4.5"/></svg>
            </button>
            {autoPlaying ? (
              <button className="nav-btn nav-btn--play" onClick={stopAutoPlay} title="Pause" aria-label="Pause">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 3.5v9M11 3.5v9"/></svg>
              </button>
            ) : (
              <button className="nav-btn nav-btn--play" onClick={startAutoPlay} disabled={isAtFilteredEnd} title="Auto-play" aria-label="Auto-play">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2.5l9 5.5-9 5.5z"/></svg>
              </button>
            )}
            <button className="nav-btn" onClick={() => { stopAutoPlay(); goToNextFiltered(); }} disabled={isAtFilteredEnd} title="Next move" aria-label="Next move">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5L12 8l-6 4.5"/></svg>
            </button>
            <button className="nav-btn" onClick={() => { stopAutoPlay(); goTo(totalMoves); }} disabled={isAtFilteredEnd} title="Go to last move" aria-label="Go to last move">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 3.5L10 8l-6 4.5"/><path d="M12 3.5v9"/></svg>
            </button>

            {/* Color filter toggle */}
            <div className="replay-color-filter" role="radiogroup" aria-label="Filter moves by player">
              {(["white", "black", "both"] as const).map((f) => (
                <button
                  key={f}
                  className={`color-filter-btn${colorFilter === f ? " color-filter-btn--active" : ""}${f !== "both" ? ` color-filter-btn--${f}` : ""}`}
                  onClick={() => setColorFilter(f)}
                  role="radio"
                  aria-checked={colorFilter === f}
                  title={f === "both" ? "Show all moves" : `Show only ${f} moves`}
                >
                  {f === "white" ? "\u26AA" : f === "black" ? "\u26AB" : "Both"}
                </button>
              ))}
            </div>

            {/* Speed */}
            <input
              type="range"
              min={SPEED_OFFSET - SPEED_MAX_MS}
              max={SPEED_OFFSET - SPEED_MIN_MS}
              step={100}
              value={SPEED_OFFSET - playSpeed}
              onChange={(e) => setPlaySpeed(SPEED_OFFSET - Number(e.target.value))}
              style={{ width: 60, accentColor: "#d4a843", marginLeft: 4 }}
              aria-label="Playback speed"
              title={playSpeed <= 500 ? "Fast" : playSpeed >= 2500 ? "Slow" : "Normal"}
            />
          </div>
        </div>
      )}

      {/* Re-analysis progress card */}
      {!embed && analysis?.status === "running" && (
        <div className="replay-progress-card" style={{ maxWidth: 1200 }}>
          <div className="replay-progress-head">
            <div>
              <h4 className="replay-progress-title">
                Re-analyzing at {analysis.analysis_ply ?? analysisPly}-ply
              </h4>
              <span className="replay-progress-caption">
                {analysis.analysis_source ?? "gnubg"}
              </span>
            </div>
            <span className="replay-progress-pct">
              {analysis.progress != null ? `${Math.round(analysis.progress * 100)}%` : "..."}
            </span>
          </div>
          <div className="replay-progress-track">
            <div
              className="replay-progress-fill"
              style={{ width: `${(analysis.progress ?? 0) * 100}%` }}
            />
          </div>
          <div className="replay-progress-meta">
            <span>{analysis.moves_analysed} / {analysis.total_moves} moves scored</span>
          </div>
        </div>
      )}

      {/* Move counter (embed fallback — nav bar hidden in embed mode) */}
      {embed && (
        <div className="replay-counter">
          {moveIndex === 0 ? (
            <span>Starting position</span>
          ) : (
            <span>Move <strong>{moveIndex}</strong> of <strong>{totalMoves}</strong></span>
          )}
        </div>
      )}

      {/* ── Main grid: Board (left) + Analysis Panel (right) ─────────── */}
      <div className="replay-main-grid">
        {/* Left column: board + move info */}
        <div className="replay-main-left">
          <div className={`replay-board-wrapper replay-board-wrapper--${viewColor}`}>
            <Board
              gameState={displayState}
              myColor={viewColor}
              selectedPoint={null}
              validMoves={[]}
              onPointClick={() => {}}
              onBarClick={() => {}}
              onBearOffClick={() => {}}
              cubeValue={cubeValue}
              cubeOwner={cubeOwner}
              moveArrows={displayMoveArrows}
              bestMoveArrows={displayBestMoveArrows}
              arrowsMoverColor={movedByColor as "white" | "black"}
              labelPerspective={currentMove ? (movedByColor as "white" | "black") : viewColor}
            />
            {replayDice && (
              <div className="replay-dice-overlay">
                <Dice
                  dice={replayDice}
                  remainingDice={remainingDiceForDisplay}
                  currentTurn={movedByColor}
                  openingRoll={openingRoll}
                  animate={false}
                />
              </div>
            )}
            {currentAnalysis && (() => {
              const selectedCand = selectedCandidate !== null ? currentAnalysis.top_moves?.[selectedCandidate] : null;
              const pillQuality = selectedCand ? classifyDelta(selectedCand.equity_diff) : currentAnalysis.quality;
              const pillWinPct = selectedCand
                ? formatPct(selectedCand.probs?.win)
                : currentWinPct;
              const moveLuck = luckByMove.get(moveIndex) ?? null;
              return (
                <div
                  className={`replay-board-analysis replay-board-analysis--${QUALITY_CSS_CLASS[pillQuality as MoveQuality] ?? pillQuality}`}
                  role="status"
                  aria-live="polite"
                >
                  <span className="replay-board-analysis-quality">
                    <QualityChip quality={pillQuality} />
                    {pillWinPct && <>{" "}{pillWinPct} win</>}
                  </span>
                  {moveLuck !== null && classifyLuck(moveLuck) !== "none" && (
                    <span className="replay-board-analysis-prob">
                      <LuckPill luck={moveLuck} />
                    </span>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Current move info */}
          <div className="replay-move-info">
            {currentMove ? (
              <>
                <span className={`replay-player-badge replay-player-${movedByColor}`}>
                  {movedBy ?? (movedByColor === "white" ? "White" : "Black")}
                </span>
                <span className="replay-notation">{notationToPlayerPerspective(currentMove.moves_notation, movedByColor as "white" | "black")}</span>
                {currentAnalysis?.best_move_notation &&
                  currentAnalysis.quality !== "best" &&
                  currentAnalysis.quality !== "very_good" && (
                    <span className="replay-notation-best">
                      best: {notationToPlayerPerspective(currentAnalysis.best_move_notation, movedByColor as "white" | "black")}
                    </span>
                  )}
              </>
            ) : (
              <span className="replay-notation-empty">Game start</span>
            )}
          </div>

          {/* Deep-dive panel (below board, full width) */}
          {deepDiveData && deepDiveMoveNumber === moveIndex && currentMove && (
            <DeepDivePanel
              data={deepDiveData}
              playedNotation={currentMove.moves_notation}
              onClose={handleCloseDeepDive}
            />
          )}
        </div>

        {/* Right column: Compact analysis panel */}
        <div className="ap">
          {/* Panel header */}
          <div className="ap-head">
            <div className="left">
              <span className="eyebrow">
                {analysis?.analysis_source
                  ? `Analysis · ${analysis.analysis_ply ?? 2}-ply`
                  : "Position analysis"}
              </span>
              <h4 className="title">
                {moveIndex === 0
                  ? "Game start"
                  : `${movedBy ?? (movedByColor === "white" ? "White" : "Black")} · ${currentMove?.dice_roll ?? ""}`}
              </h4>
            </div>
            <div className="right">
              {diceValues && (
                <span className="ap-roll">
                  <span className="ap-die">{diceValues.die1}</span>
                  <span className="ap-die">{diceValues.die2}</span>
                </span>
              )}
              {currentAnalysis && <QualityChip quality={currentAnalysis.quality} />}
            </div>
          </div>

          {/* Played-move banner */}
          {currentAnalysis && moveIndex > 0 && (
            <div className="ap-played">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="label">Played</span>
                <span className="move">
                  {notationToPlayerPerspective(currentAnalysis.moves_notation, movedByColor as "white" | "black")}
                </span>
              </div>
              {currentAnalysis.equity_loss > 0.001 && (
                <span className="equity-loss">
                  <span className="neg">{"\u2212"}{currentAnalysis.equity_loss.toFixed(3)}</span>
                </span>
              )}
            </div>
          )}

          {/* Ply selector */}
          {!embed && (
            <div className="scale-legend">
              <div className="replay-ply-selector" role="radiogroup" aria-label="Analysis depth" style={{ marginRight: "auto" }}>
                {([0, 2, 3] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`replay-ply-btn${analysisPly === p ? " replay-ply-btn--active" : ""}`}
                    onClick={() => handlePlyChange(p)}
                    disabled={analysisLoading}
                    aria-pressed={analysisPly === p}
                    title={
                      p === 0 ? "Fast (neural net only)" :
                      p === 2 ? "Standard (2-ply lookahead)" :
                      "Deep (3-ply, slower)"
                    }
                  >
                    {p}-ply
                  </button>
                ))}
              </div>
              <span className="item"><span className="dot" style={{ background: "var(--q-best-bar)" }} />Best</span>
              <span className="item"><span className="dot" style={{ background: "var(--q-good-bar)" }} />Good</span>
              <span className="item"><span className="dot" style={{ background: "var(--q-doubtful-bar)" }} />Doubtful</span>
              <span className="item"><span className="dot" style={{ background: "var(--q-mistake-bar)" }} />Mistake</span>
              <span className="item"><span className="dot" style={{ background: "var(--q-blunder-bar)" }} />Blunder</span>
            </div>
          )}

          {/* Loading / error / no data states */}
          {analysisLoading && !analysis?.status && (
            <div className="ap-status">
              <span className="spin" />Analyzing{analysisPly >= 3 ? " (deep)" : ""}...
            </div>
          )}
          {analysisError && !analysisLoading && (
            <div className="ap-status" style={{ color: "var(--danger, #e74c3c)" }}>
              {analysisError}
            </div>
          )}

          {/* Candidate moves list */}
          {currentAnalysis?.top_moves && currentAnalysis.top_moves.length > 0 && moveIndex > 0 && (
            <div className="ap-list">
              {currentAnalysis.top_moves.map((c, idx) => {
                const candidateQ = classifyDelta(c.equity_diff);
                const isSelected = selectedCandidate === idx;
                const isPlayed = normaliseNotation(c.notation) === normaliseNotation(currentMove?.moves_notation ?? "");
                return (
                  <div
                    key={c.rank}
                    className={`ap-row${isSelected ? " is-selected" : ""}`}
                    onClick={() => setSelectedCandidate(isSelected ? null : idx)}
                  >
                    <span className={`quality-bar qbar--${candidateQ}`} />
                    <div className="move-body">
                      <div className="move-line">
                        <span className="notation">
                          {notationToPlayerPerspective(c.notation, movedByColor as "white" | "black")}
                        </span>
                        <QualityChip quality={candidateQ} />
                        {isPlayed && <span className="played-tag">played</span>}
                      </div>
                      <EquityBar delta={c.equity_diff} quality={candidateQ} max={equityBarMax} />
                    </div>
                    <div className="equity">
                      <span className="num">{formatEq(c.equity)}</span>
                      <span className={`delta ${deltaClass(c.equity_diff)}`}>
                        {formatDelta(c.equity_diff)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state when no top moves */}
          {moveIndex > 0 && currentAnalysis && (!currentAnalysis.top_moves || currentAnalysis.top_moves.length === 0) && (
            <div className="ap-status">No candidate moves available for this position.</div>
          )}
          {moveIndex === 0 && (
            <div className="ap-status">Navigate to a move to see analysis.</div>
          )}

          {/* Panel footer */}
          <div className="ap-foot">
            <span>
              {analysis?.analysis_source ?? (analysisSource === "gnubg" ? "gnubg" : "analysis")}
              {analysis?.analysis_ply != null ? ` · ${analysis.analysis_ply}-ply` : ""}
            </span>
            <div className="right">
              {currentAnalysis && moveIndex > 0 && (
                <button
                  onClick={() => handleDeepDive(moveIndex)}
                  disabled={deepDiveLoading && deepDiveMoveNumber === moveIndex}
                  title="Run maximum-depth analysis"
                >
                  {deepDiveLoading && deepDiveMoveNumber === moveIndex ? "..." : "Deep-dive"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Full analysis panel (always visible in replay) ── */}
      {!embed && (
        <div id="replay-analysis-panel" className="replay-analysis">
          {analysis?.status === "running" && (
            <div className="replay-analysis-status">
              <div>Deep analysis in progress… {analysis.progress != null ? `${Math.round(analysis.progress * 100)}%` : ""}</div>
              {analysis.progress != null && (
                <div className="replay-analysis-progress-bar">
                  <div className="replay-analysis-progress-fill" style={{ width: `${analysis.progress * 100}%` }} />
                </div>
              )}
              <div className="replay-analysis-progress-detail">
                {analysis.moves_analysed} of {analysis.total_moves} moves analysed
              </div>
            </div>
          )}
          {analysis?.status === "failed" && !analysisLoading && (
            <div className="replay-analysis-status replay-analysis-status--error">
              Deep analysis failed.{" "}
              <button type="button" className="replay-analysis-retry-btn" onClick={() => fetchAnalysis(analysisPly, true)}>Retry</button>
            </div>
          )}
          {analysisLoading && !analysis?.status && (
            <div className="replay-analysis-status">
              Analysing game{analysisPly >= 3 ? " (deep, may take a while)" : ""}…
            </div>
          )}
          {analysisError && !analysisLoading && (
            <div className="replay-analysis-status replay-analysis-status--error">{analysisError}</div>
          )}
          {analysis && analysis.status !== "failed" && analysis.move_analyses.length > 0 && (
            <>
              {!analysis.analysis_source && analysisSource !== "gnubg" && !analysis.ml_available && (
                <div className="replay-analysis-banner">
                  ML model unavailable — showing pip-count fallback analysis.
                </div>
              )}
              {playerSummaries && (
                <div className="replay-analysis-section">
                  <h3 className="replay-analysis-heading">Game summary</h3>
                  <div className="replay-summary-grid">
                    {(["white", "black"] as const).map((c) => {
                      const s = playerSummaries[c];
                      if (!s || s.totalMoves === 0) return null;
                      const avgLoss = s.totalEquityLoss / s.totalMoves;
                      const qualityOrder = ["Best", "Good", "Doubtful", "Mistake", "Blunder"];
                      return (
                        <div key={c} className="replay-summary-player">
                          <span className={`replay-player-badge replay-player-${c}`}>{s.nickname}</span>
                          <div className="replay-summary-stat">
                            <span className="replay-summary-label">Avg error</span>
                            <span className="replay-summary-value">{avgLoss.toFixed(3)}</span>
                          </div>
                          <div className="replay-summary-stat">
                            <span className="replay-summary-label">Total loss</span>
                            <span className="replay-summary-value">{s.totalEquityLoss.toFixed(2)}</span>
                          </div>
                          <div className="replay-summary-qualities">
                            {qualityOrder.map((label) => {
                              const count = s.qualityCounts[label];
                              if (!count) return null;
                              const cssKey = Object.entries(QUALITY_LABEL).find(([, v]) => v === label)?.[0] as MoveQuality | undefined;
                              const css = cssKey ? QUALITY_CSS_CLASS[cssKey] : "good";
                              return (
                                <span key={label} className={`replay-summary-quality replay-quality--${css}`}>
                                  {count} {label}
                                </span>
                              );
                            })}
                          </div>
                          {luckSummary[c] !== 0 && (
                            <div className="replay-summary-stat">
                              <span className="replay-summary-label">{"\u2618"} Luck</span>
                              <span className="replay-summary-value">
                                <LuckPill luck={luckSummary[c]} />
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Win probability chart */}
              {winProbSeries.length > 1 && (
                <div className="replay-analysis-section">
                  <h3 className="replay-analysis-heading">Win probability</h3>
                  <div className="wp-chart-wrap">
                    <svg
                      viewBox={`0 0 ${Math.max(300, winProbSeries.length * 6 + 60)} 160`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {(() => {
                        const W = Math.max(300, winProbSeries.length * 6 + 60);
                        const H = 160;
                        const pad = { top: 15, right: 15, bottom: 25, left: 40 };
                        const cw = W - pad.left - pad.right;
                        const ch = H - pad.top - pad.bottom;
                        const maxMove = winProbSeries[winProbSeries.length - 1].move;
                        const x = (m: number) => pad.left + (m / maxMove) * cw;
                        const y = (p: number) => pad.top + (1 - p) * ch;

                        // Build the line path
                        const linePts = winProbSeries.map((d) => `${x(d.move).toFixed(1)},${y(d.whiteWin).toFixed(1)}`);
                        const linePath = `M${linePts.join("L")}`;
                        // Fill areas: above 50% = white advantage, below = black
                        const fillPath = `M${x(winProbSeries[0].move).toFixed(1)},${y(0.5).toFixed(1)}L${linePts.join("L")}L${x(maxMove).toFixed(1)},${y(0.5).toFixed(1)}Z`;

                        return (
                          <g>
                            {/* Grid lines */}
                            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
                              <g key={p}>
                                <line x1={pad.left} x2={W - pad.right} y1={y(p)} y2={y(p)}
                                  stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                                <text x={pad.left - 4} y={y(p) + 3.5} textAnchor="end"
                                  fill="rgba(255,255,255,0.35)" fontSize="9">
                                  {(p * 100).toFixed(0)}%
                                </text>
                              </g>
                            ))}
                            {/* 50% midline */}
                            <line x1={pad.left} x2={W - pad.right} y1={y(0.5)} y2={y(0.5)}
                              stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4 3" />
                            {/* Filled area */}
                            <clipPath id="wp-above">
                              <rect x={pad.left} y={pad.top} width={cw} height={ch / 2} />
                            </clipPath>
                            <clipPath id="wp-below">
                              <rect x={pad.left} y={y(0.5)} width={cw} height={ch / 2} />
                            </clipPath>
                            <path d={fillPath} fill="rgba(255,255,255,0.06)" clipPath="url(#wp-above)" />
                            <path d={fillPath} fill="rgba(100,100,120,0.08)" clipPath="url(#wp-below)" />
                            {/* Line */}
                            <path d={linePath} fill="none" stroke="var(--accent, #d4a843)" strokeWidth="1.5" strokeLinejoin="round" />
                            {/* X-axis label */}
                            <text x={pad.left + cw / 2} y={H - 3} textAnchor="middle"
                              fill="rgba(255,255,255,0.35)" fontSize="9">
                              Move
                            </text>
                            {/* Click targets */}
                            {winProbSeries.map((d) => (
                              <rect key={d.move} className="wp-chart-hit-area"
                                x={x(d.move) - 3} y={pad.top} width={6} height={ch}
                                fill="transparent"
                                onClick={() => { stopAutoPlay(); goTo(d.move); }}
                              />
                            ))}
                            {/* Current position marker */}
                            {winProbSeries.find((d) => d.move === moveIndex) && (() => {
                              const d = winProbSeries.find((d) => d.move === moveIndex)!;
                              return (
                                <>
                                  <line x1={x(d.move)} x2={x(d.move)} y1={pad.top} y2={pad.top + ch}
                                    stroke="var(--accent, #d4a843)" strokeWidth="1" opacity="0.5" />
                                  <circle cx={x(d.move)} cy={y(d.whiteWin)} r="3.5"
                                    fill="var(--accent, #d4a843)" stroke="#1a1a2e" strokeWidth="1.5" />
                                </>
                              );
                            })()}
                            {/* Player labels */}
                            <text x={W - pad.right} y={pad.top + 10} textAnchor="end"
                              fill="rgba(255,255,255,0.4)" fontSize="8">White</text>
                            <text x={W - pad.right} y={pad.top + ch - 4} textAnchor="end"
                              fill="rgba(255,255,255,0.4)" fontSize="8">Black</text>
                          </g>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              )}

              {keyMoments.length > 0 && (
                <div className="replay-analysis-section">
                  <h3 className="replay-analysis-heading">Key moments</h3>
                  <ol className="replay-key-moments">
                    {keyMoments.map((m) => (
                      <li key={`key-${m.move_number}`}>
                        <button
                          type="button"
                          className="replay-key-moment"
                          onClick={() => { stopAutoPlay(); goTo(m.move_number); }}
                        >
                          <QualityChip quality={m.quality} />
                          <span className="replay-key-moment-move">
                            Move {m.move_number} · {m.dice_roll} · {notationToPlayerPerspective(m.moves_notation, m.player_color)}
                          </span>
                          <span className="replay-key-moment-loss">
                            {"\u2212"}{m.equity_loss.toFixed(3)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="replay-analysis-section">
                <h3 className="replay-analysis-heading">
                  Move list ({analysis.moves_analysed}
                  {analysis.total_moves > analysis.moves_analysed ? ` of ${analysis.total_moves}` : ""})
                </h3>
                {analysis.analysis_source && analysis.status === "complete" && (
                  <p className="replay-analysis-attribution">
                    Analyzed by {analysis.analysis_source}
                  </p>
                )}
                {!analysis.analysis_source && analysisSource === "gnubg" && (
                  <p className="replay-analysis-attribution">
                    Analyzed by GNU Backgammon
                  </p>
                )}
                <ul className="replay-move-list">
                  {analysis.move_analyses.filter((m) => colorFilter === "both" || m.player_color === colorFilter).map((m) => {
                    const chosenPct = formatPct(m.chosen_win_prob ?? m.chosen_probs?.win);
                    const bestPct = formatPct(m.best_win_prob ?? m.best_probs?.win);
                    const hasProbs = chosenPct !== null || bestPct !== null;
                    const hasDetails = !!m.chosen_probs || !!m.best_probs;
                    const isExpanded = expandedMoves.has(m.move_number);
                    const chosenIsBest =
                      chosenPct !== null && bestPct !== null &&
                      (m.quality === "best" || m.quality === "very_good") &&
                      (m.best_move_notation == null || m.equity_loss < 0.001);
                    return (
                      <li key={m.move_number} className={`replay-move-item${m.move_number === moveIndex ? " replay-move-item--active" : ""}`}>
                        <button
                          type="button"
                          className="replay-move-item-btn"
                          onClick={() => { stopAutoPlay(); goTo(m.move_number); }}
                        >
                          <span className="replay-move-item-num">{m.move_number}</span>
                          <QualityChip quality={m.quality} />
                          <span className="replay-move-item-player">
                            {m.player_color === "white" ? "\u26AA" : "\u26AB"} {m.dice_roll}
                          </span>
                          {(() => { const ml = luckByMove.get(m.move_number); return ml != null ? <LuckPill luck={ml} /> : null; })()}
                          <span className="replay-move-item-notation">
                            {notationToPlayerPerspective(m.moves_notation, m.player_color)}
                          </span>
                          {m.quality !== "best" && m.quality !== "very_good" && m.best_move_notation && (
                            <span className="replay-move-item-best">
                              best: {notationToPlayerPerspective(m.best_move_notation, m.player_color)}
                            </span>
                          )}
                        </button>
                        {hasProbs && (
                          <div className="replay-move-probs">
                            {chosenIsBest ? (
                              <span className="replay-move-probs-row">
                                <span className="replay-move-probs-notation">
                                  {notationToPlayerPerspective(m.moves_notation, m.player_color)}
                                </span>
                                <span className="replay-move-probs-pct replay-move-probs-pct--chosen">{chosenPct} win</span>
                                <span className="replay-move-probs-label replay-move-probs-label--best">Best</span>
                              </span>
                            ) : (
                              <>
                                {chosenPct && (
                                  <span className="replay-move-probs-row">
                                    <span className="replay-move-probs-label">Chosen</span>
                                    <span className="replay-move-probs-notation">{notationToPlayerPerspective(m.moves_notation, m.player_color)}</span>
                                    <span className="replay-move-probs-pct replay-move-probs-pct--chosen">{chosenPct} win</span>
                                  </span>
                                )}
                                {bestPct && (m.quality !== "best" || chosenPct !== bestPct) && (
                                  <span className="replay-move-probs-row">
                                    <span className="replay-move-probs-label replay-move-probs-label--best">Best</span>
                                    <span className="replay-move-probs-notation">{notationToPlayerPerspective(m.best_move_notation ?? m.moves_notation, m.player_color)}</span>
                                    <span className="replay-move-probs-pct replay-move-probs-pct--best">{bestPct} win</span>
                                  </span>
                                )}
                              </>
                            )}
                            {!chosenIsBest && (
                              <span className="replay-move-probs-delta">{"\u0394"} equity {"\u2212"}{m.equity_loss.toFixed(3)}</span>
                            )}
                            {hasDetails && (
                              <button
                                type="button"
                                className={`replay-move-probs-toggle${isExpanded ? " replay-move-probs-toggle--open" : ""}`}
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? `Hide gammon breakdown for move ${m.move_number}` : `Show gammon breakdown for move ${m.move_number}`}
                                onClick={() => toggleMoveDetails(m.move_number)}
                              >
                                {isExpanded ? "\u25BE" : "\u25B8"} details
                              </button>
                            )}
                          </div>
                        )}
                        {isExpanded && hasDetails && (
                          <MoveProbsBreakdown chosen={m.chosen_probs ?? null} best={m.best_probs ?? null} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {/* Re-analyze modal */}
      {showReanalyzeModal && (
        <ReanalyzeModal
          currentAnalysis={analysis}
          totalMoves={totalMoves}
          onConfirm={handleReanalyze}
          onClose={() => setShowReanalyzeModal(false)}
        />
      )}
    </div>
  );
}

export default GameReplay;
