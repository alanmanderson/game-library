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
  GameState,
  MoveAnalysis,
  MoveProbs,
  MoveQuality,
  ReplayData,
  ReplayMoveRecord,
} from "../types/game";
import { getAnalysis, getReplay } from "../services/api";
import Board from "./Board";
import Dice from "./Dice";
import { STORAGE_KEY } from "../constants";
import { parseMovesNotation, type ParsedMove } from "../utils/notation";
import "./styles/GameReplay.css";

/** Return the set of on-board destination points touched by the parsed moves. */
function destinationPoints(moves: ParsedMove[]): Set<number> {
  const out = new Set<number>();
  for (const m of moves) {
    if (typeof m.to === "number" && m.to >= 1 && m.to <= 24) out.add(m.to);
  }
  return out;
}

/** Return the set of on-board source + destination points touched by the moves. */
function sourceAndDestPoints(moves: ParsedMove[]): Set<number> {
  const out = destinationPoints(moves);
  for (const m of moves) {
    if (typeof m.from === "number" && m.from >= 1 && m.from <= 24) out.add(m.from);
  }
  return out;
}

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
 * Covers both the ML-native labels (`best`, `good`, `inaccuracy`, `mistake`,
 * `blunder`) and the GNU Backgammon native labels (`very_good`, `doubtful`,
 * `bad`, `very_bad`).
 */
const QUALITY_LABEL: Record<MoveQuality, string> = {
  best: "Best",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
  very_good: "Very good",
  doubtful: "Doubtful",
  bad: "Bad",
  very_bad: "Very bad",
};

/**
 * Map every quality label to an existing CSS colour class.
 *
 * gnubg-native labels reuse the closest matching ML colour: `very_good` → best,
 * `doubtful` → inaccuracy, `bad` → mistake, `very_bad` → blunder. This keeps
 * the palette tight and avoids inventing new colours for conceptually similar
 * buckets.
 */
const QUALITY_CSS_CLASS: Record<MoveQuality, string> = {
  best: "best",
  good: "good",
  inaccuracy: "inaccuracy",
  mistake: "mistake",
  blunder: "blunder",
  very_good: "best",
  doubtful: "inaccuracy",
  bad: "mistake",
  very_bad: "blunder",
};

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

  // Analysis panel state
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  /** Move numbers whose details panel (gammon/bg breakdown) is expanded. */
  const [expandedMoves, setExpandedMoves] = useState<Set<number>>(new Set());

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

  // Stop auto-play when we reach the end or when the component unmounts
  useEffect(() => {
    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
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
        const next = prev + 1;
        if (next >= totalMoves) {
          stopAutoPlay();
          return totalMoves;
        }
        return next;
      });
    }, playSpeed);
  }, [playSpeed, totalMoves, stopAutoPlay]);

  // Restart timer when speed changes while auto-playing
  useEffect(() => {
    if (autoPlaying) {
      startAutoPlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSpeed]);

  // Stop auto-play when reaching the end
  useEffect(() => {
    if (autoPlaying && moveIndex >= totalMoves) {
      stopAutoPlay();
    }
  }, [autoPlaying, moveIndex, totalMoves, stopAutoPlay]);

  const fetchAnalysis = useCallback(async () => {
    if (analysis || !tableId) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const data = await getAnalysis(tableId);
      setAnalysis(data);
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "Failed to load analysis.",
      );
    } finally {
      setAnalysisLoading(false);
    }
  }, [analysis, tableId]);

  // Fetch analysis as soon as the replay loads so the on-board quality
  // indicator is available without requiring the user to open the panel.
  useEffect(() => {
    if (!replayData) return;
    fetchAnalysis();
  }, [replayData, fetchAnalysis]);

  const handleToggleAnalysis = useCallback(async () => {
    const next = !analysisOpen;
    setAnalysisOpen(next);
    if (next) await fetchAnalysis();
  }, [analysisOpen, fetchAnalysis]);

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

  // Orient the board to the logged-in player's perspective when they were
  // one of the two seats. Fall back to white for spectators/unauthed viewers.
  const storedPlayerId = useMemo(() => readStoredPlayerId(), []);
  const viewColor: "white" | "black" =
    storedPlayerId && replayData?.black_player_id === storedPlayerId
      ? "black"
      : "white";

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

  // Destinations of the checkers that moved in the current step — rendered as
  // a yellow triangle highlight so the viewer can see what just changed.
  const movedPoints = currentMove
    ? destinationPoints(parseMovesNotation(currentMove.moves_notation))
    : undefined;

  // When the player didn't pick the engine's top move, outline the engine's
  // intended source + destination points in red so the recommended play is
  // visible on the board.
  const bestMovePoints =
    currentAnalysis &&
    currentAnalysis.best_move_notation &&
    currentAnalysis.quality !== "best" &&
    currentAnalysis.quality !== "very_good"
      ? sourceAndDestPoints(
          parseMovesNotation(currentAnalysis.best_move_notation),
        )
      : undefined;

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
          <button
            type="button"
            className={`replay-share-btn${copied ? " replay-share-btn--copied" : ""}`}
            onClick={handleCopyShareLink}
            aria-label="Copy share link"
            title="Copy a public link to this replay"
          >
            {copied ? "✓ Copied!" : "🔗 Copy Share Link"}
          </button>
        </div>
      )}

      {/* Move counter */}
      <div className="replay-counter">
        {moveIndex === 0 ? (
          <span>Starting position</span>
        ) : (
          <span>
            Move <strong>{moveIndex}</strong> of <strong>{totalMoves}</strong>
          </span>
        )}
      </div>

      {/* Board */}
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
          movedPoints={movedPoints}
          bestMovePoints={bestMovePoints}
        />
        {replayDice && (
          <div className="replay-dice-overlay">
            <Dice
              dice={replayDice}
              remainingDice={remainingDiceForDisplay}
              currentTurn={movedByColor}
              openingRoll={openingRoll}
            />
          </div>
        )}
        {currentAnalysis && (
          <div
            className={`replay-board-analysis replay-board-analysis--${QUALITY_CSS_CLASS[currentAnalysis.quality]}`}
            role="status"
            aria-live="polite"
          >
            <span className="replay-board-analysis-quality">
              {QUALITY_LABEL[currentAnalysis.quality]}
            </span>
            {currentWinPct && (
              <span className="replay-board-analysis-prob">
                {currentWinPct} win
              </span>
            )}
          </div>
        )}
      </div>

      {/* Current move info */}
      <div className="replay-move-info">
        {currentMove ? (
          <>
            <span className={`replay-player-badge replay-player-${movedByColor}`}>
              {movedBy ?? (movedByColor === "white" ? "White" : "Black")}
            </span>
            <span className="replay-dice">🎲 {currentMove.dice_roll}</span>
            <span className="replay-notation">{currentMove.moves_notation}</span>
          </>
        ) : (
          <span className="replay-notation-empty">Game start</span>
        )}
      </div>

      {/* Navigation controls */}
      <div className="replay-controls">
        <button
          className="replay-btn"
          onClick={() => { stopAutoPlay(); goTo(0); }}
          disabled={moveIndex === 0}
          title="First move"
          aria-label="Go to first move"
        >
          ⏮
        </button>
        <button
          className="replay-btn"
          onClick={() => { stopAutoPlay(); goTo(moveIndex - 1); }}
          disabled={moveIndex === 0}
          title="Previous move"
          aria-label="Previous move"
        >
          ◀
        </button>

        {autoPlaying ? (
          <button
            className="replay-btn replay-btn-play"
            onClick={stopAutoPlay}
            title="Pause auto-play"
            aria-label="Pause"
          >
            ⏸
          </button>
        ) : (
          <button
            className="replay-btn replay-btn-play"
            onClick={startAutoPlay}
            disabled={moveIndex >= totalMoves}
            title="Auto-play"
            aria-label="Auto-play"
          >
            ▶
          </button>
        )}

        <button
          className="replay-btn"
          onClick={() => { stopAutoPlay(); goTo(moveIndex + 1); }}
          disabled={moveIndex >= totalMoves}
          title="Next move"
          aria-label="Next move"
        >
          ▶
        </button>
        <button
          className="replay-btn"
          onClick={() => { stopAutoPlay(); goTo(totalMoves); }}
          disabled={moveIndex >= totalMoves}
          title="Last move"
          aria-label="Go to last move"
        >
          ⏭
        </button>
      </div>

      {/* Analysis toggle */}
      {!embed && (
        <button
          type="button"
          className={`replay-analysis-toggle${analysisOpen ? " replay-analysis-toggle--open" : ""}`}
          onClick={handleToggleAnalysis}
          aria-expanded={analysisOpen}
          aria-controls="replay-analysis-panel"
        >
          {analysisOpen ? "▼ Hide analysis" : "▶ Show move analysis"}
        </button>
      )}

      {analysisOpen && (
        <div id="replay-analysis-panel" className="replay-analysis">
          {analysisLoading && (
            <div className="replay-analysis-status">Analysing game…</div>
          )}
          {analysisError && !analysisLoading && (
            <div className="replay-analysis-status replay-analysis-status--error">
              {analysisError}
            </div>
          )}
          {!analysisLoading && !analysisError && analysis && (
            <>
              {analysisSource !== "gnubg" && !analysis.ml_available && (
                <div className="replay-analysis-banner">
                  ML model unavailable — showing pip-count fallback analysis.
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
                          onClick={() => {
                            stopAutoPlay();
                            goTo(m.move_number);
                          }}
                        >
                          <span
                            className={`replay-quality replay-quality--${QUALITY_CSS_CLASS[m.quality]}`}
                          >
                            {QUALITY_LABEL[m.quality]}
                          </span>
                          <span className="replay-key-moment-move">
                            Move {m.move_number} · {m.dice_roll} ·{" "}
                            {m.moves_notation}
                          </span>
                          <span className="replay-key-moment-loss">
                            −{m.equity_loss.toFixed(2)}
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
                  {analysis.total_moves > analysis.moves_analysed
                    ? ` of ${analysis.total_moves}`
                    : ""}
                  )
                </h3>
                {analysisSource === "gnubg" && (
                  <p
                    className="replay-analysis-attribution"
                    title="Each move is evaluated by the gnubg engine. Win probabilities reflect the chance the mover wins from that position."
                  >
                    Analyzed by GNU Backgammon
                  </p>
                )}
                <ul className="replay-move-list">
                  {analysis.move_analyses.map((m) => {
                    const chosenPct = formatPct(
                      m.chosen_win_prob ?? m.chosen_probs?.win,
                    );
                    const bestPct = formatPct(
                      m.best_win_prob ?? m.best_probs?.win,
                    );
                    const hasProbs = chosenPct !== null || bestPct !== null;
                    const hasDetails =
                      !!m.chosen_probs || !!m.best_probs;
                    const isExpanded = expandedMoves.has(m.move_number);
                    // Collapse the "chosen == best" case into a single line:
                    // when the player played the top move, showing two identical
                    // rows duplicates the same number. A move is considered the
                    // top pick if it's labelled best/very_good AND either there's
                    // no distinct best-move notation or the equity loss is
                    // effectively zero.
                    const chosenIsBest =
                      chosenPct !== null &&
                      bestPct !== null &&
                      (m.quality === "best" || m.quality === "very_good") &&
                      (m.best_move_notation == null || m.equity_loss < 0.001);
                    return (
                      <li
                        key={m.move_number}
                        className={`replay-move-item${m.move_number === moveIndex ? " replay-move-item--active" : ""}`}
                      >
                        <button
                          type="button"
                          className="replay-move-item-btn"
                          onClick={() => {
                            stopAutoPlay();
                            goTo(m.move_number);
                          }}
                        >
                          <span className="replay-move-item-num">
                            {m.move_number}
                          </span>
                          <span
                            className={`replay-quality replay-quality--${QUALITY_CSS_CLASS[m.quality]}`}
                            title={`Equity loss: ${m.equity_loss.toFixed(3)}`}
                          >
                            {QUALITY_LABEL[m.quality]}
                          </span>
                          <span className="replay-move-item-player">
                            {m.player_color === "white" ? "⚪" : "⚫"} {m.dice_roll}
                          </span>
                          <span className="replay-move-item-notation">
                            {m.moves_notation}
                          </span>
                          {m.quality !== "best" && m.best_move_notation && (
                            <span className="replay-move-item-best">
                              best: {m.best_move_notation}
                            </span>
                          )}
                        </button>

                        {hasProbs && (
                          <div className="replay-move-probs">
                            {chosenIsBest ? (
                              <span className="replay-move-probs-row">
                                <span className="replay-move-probs-notation">
                                  {m.moves_notation}
                                </span>
                                <span className="replay-move-probs-pct replay-move-probs-pct--chosen">
                                  {chosenPct} win
                                </span>
                                <span className="replay-move-probs-label replay-move-probs-label--best">
                                  Best
                                </span>
                              </span>
                            ) : (
                              <>
                                {chosenPct && (
                                  <span className="replay-move-probs-row">
                                    <span className="replay-move-probs-label">
                                      Chosen
                                    </span>
                                    <span className="replay-move-probs-notation">
                                      {m.moves_notation}
                                    </span>
                                    <span className="replay-move-probs-pct replay-move-probs-pct--chosen">
                                      {chosenPct} win
                                    </span>
                                  </span>
                                )}
                                {bestPct &&
                                  (m.quality !== "best" || chosenPct !== bestPct) && (
                                    <span className="replay-move-probs-row">
                                      <span className="replay-move-probs-label replay-move-probs-label--best">
                                        Best
                                      </span>
                                      <span className="replay-move-probs-notation">
                                        {m.best_move_notation ?? m.moves_notation}
                                      </span>
                                      <span className="replay-move-probs-pct replay-move-probs-pct--best">
                                        {bestPct} win
                                      </span>
                                    </span>
                                  )}
                              </>
                            )}
                            {!chosenIsBest && (
                              <span className="replay-move-probs-delta">
                                Δ equity −{m.equity_loss.toFixed(3)}
                              </span>
                            )}
                            {hasDetails && (
                              <button
                                type="button"
                                className={`replay-move-probs-toggle${isExpanded ? " replay-move-probs-toggle--open" : ""}`}
                                aria-expanded={isExpanded}
                                aria-label={
                                  isExpanded
                                    ? `Hide gammon breakdown for move ${m.move_number}`
                                    : `Show gammon breakdown for move ${m.move_number}`
                                }
                                onClick={() =>
                                  toggleMoveDetails(m.move_number)
                                }
                              >
                                {isExpanded ? "▾" : "▸"} details
                              </button>
                            )}
                          </div>
                        )}

                        {isExpanded && hasDetails && (
                          <MoveProbsBreakdown
                            chosen={m.chosen_probs ?? null}
                            best={m.best_probs ?? null}
                          />
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

      {/* Speed control */}
      <div className="replay-speed">
        <label htmlFor="replay-speed-slider" className="replay-speed-label">
          Speed
        </label>
        <input
          id="replay-speed-slider"
          type="range"
          min={SPEED_OFFSET - SPEED_MAX_MS}
          max={SPEED_OFFSET - SPEED_MIN_MS}
          step={100}
          value={SPEED_OFFSET - playSpeed} /* invert so right = faster */
          onChange={(e) => setPlaySpeed(SPEED_OFFSET - Number(e.target.value))}
          className="replay-speed-slider"
          aria-label="Auto-play speed"
        />
        <span className="replay-speed-hint">
          {playSpeed <= 500 ? "Fast" : playSpeed >= 2500 ? "Slow" : "Normal"}
        </span>
      </div>
    </div>
  );
}

export default GameReplay;
