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

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import type { GameState, ReplayData, ReplayMoveRecord } from "../types/game";
import { getReplay } from "../services/api";
import Board from "./Board";
import "./styles/GameReplay.css";

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

  // Use white perspective by default (board flips with myColor)
  const viewColor = "white";

  const cubeValue = displayState.cube_value ?? 1;
  const cubeOwner = displayState.cube_owner ?? null;

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
      <div className="replay-board-wrapper">
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
        />
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
