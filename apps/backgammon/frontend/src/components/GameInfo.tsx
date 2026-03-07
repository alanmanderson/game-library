import { useState, useEffect, useCallback, useMemo } from "react";
import type { GameState, Color, Table, MoveRecord } from "../types/game";
import { getGameHistory } from "../services/api";
import "./styles/GameInfo.css";

interface GameInfoProps {
  table: Table;
  gameState: GameState;
  myColor: Color;
}

function GameInfo({ table, gameState, myColor }: GameInfoProps) {
  const [copied, setCopied] = useState(false);
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(table.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select a hidden input
      const el = document.createElement("input");
      el.value = table.id;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [table.id]);

  // Poll move history periodically during the game
  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      try {
        const history = await getGameHistory(table.id);
        if (!cancelled) {
          setMoveHistory(history);
        }
      } catch {
        // silently ignore history fetch errors
      }
    }

    fetchHistory();

    const interval = setInterval(fetchHistory, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [table.id]);

  const pipCounts = useMemo(() => {
    let whitePips = 0;
    let blackPips = 0;
    for (let i = 1; i <= 24; i++) {
      const val = gameState.points[i];
      if (val > 0) whitePips += i * val;       // white checkers, distance to point 0
      if (val < 0) blackPips += (25 - i) * (-val);  // black checkers, distance to point 25
    }
    whitePips += 25 * gameState.bar_white;
    blackPips += 25 * gameState.bar_black;
    return { white: whitePips, black: blackPips };
  }, [gameState.points, gameState.bar_white, gameState.bar_black]);

  const whiteName = table.white_player?.nickname ?? "Waiting...";
  const blackName = table.black_player?.nickname ?? "Waiting...";

  return (
    <div className="game-info">
      {/* Table ID */}
      <div className="game-info-section">
        <h4>Table</h4>
        <div className="table-id-row">
          <code>{table.id}</code>
          <button className="copy-btn" onClick={handleCopy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Match */}
      <div className="game-info-section">
        <h4>Match</h4>
        <div>First to {table.match_points} points</div>
        <div className="checker-counts">
          <span>White: {table.white_match_score}</span>
          <span>Black: {table.black_match_score}</span>
        </div>
      </div>

      {/* Players */}
      <div className="game-info-section">
        <h4>Players</h4>
        <div className="player-row">
          <span className="player-color-dot white" />
          <span className={`player-name ${myColor === "white" ? "you" : ""} ${!table.white_player ? "waiting" : ""}`}>
            {whiteName}
            {myColor === "white" ? " (you)" : ""}
          </span>
        </div>
        <div className="player-row">
          <span className="player-color-dot black" />
          <span className={`player-name ${myColor === "black" ? "you" : ""} ${!table.black_player ? "waiting" : ""}`}>
            {blackName}
            {myColor === "black" ? " (you)" : ""}
          </span>
        </div>
      </div>

      {/* Checker counts */}
      <div className="game-info-section">
        <h4>Score</h4>
        <div className="checker-counts">
          <span>White pips: {pipCounts.white}</span>
          <span>Black pips: {pipCounts.black}</span>
        </div>
      </div>

      {/* Move History */}
      <div className="game-info-section">
        <h4>Move History</h4>
        {moveHistory.length === 0 ? (
          <div className="move-history-empty">No moves yet.</div>
        ) : (
          <div className="move-history">
            {moveHistory.map((record) => (
              <div key={record.move_number} className="move-history-entry">
                <strong>#{record.move_number}</strong> [{record.dice_roll}]{" "}
                {record.moves_notation}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default GameInfo;
