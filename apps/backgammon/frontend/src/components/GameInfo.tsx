import { useState, useEffect, useCallback } from "react";
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
          <span>White borne off: {gameState.off_white}</span>
          <span>Black borne off: {gameState.off_black}</span>
        </div>
        <div className="checker-counts">
          <span>White on bar: {gameState.bar_white}</span>
          <span>Black on bar: {gameState.bar_black}</span>
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
