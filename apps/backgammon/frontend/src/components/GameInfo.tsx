import { useState, useEffect } from "react";
import type { Table, MoveRecord, GameStatus } from "../types/game";
import { getGameHistory } from "../services/api";
import "./styles/GameInfo.css";

interface GameInfoProps {
  table: Table;
  gameStatus: GameStatus;
}

function GameInfo({ table, gameStatus }: GameInfoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);

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

    // Always fetch once to get latest history
    fetchHistory();

    // Only poll while the game is still active
    let interval: ReturnType<typeof setInterval> | undefined;
    if (gameStatus !== "finished") {
      interval = setInterval(fetchHistory, 5000);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [table.id, gameStatus]);

  return (
    <div className="move-history-drawer">
      <button
        className={`drawer-toggle ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="drawer-arrow">{isOpen ? "\u25BC" : "\u25B6"}</span>
        Move History
        {moveHistory.length > 0 && (
          <span className="move-count">({moveHistory.length})</span>
        )}
      </button>
      {isOpen && (
        <div className="move-history">
          {moveHistory.length === 0 ? (
            <div className="move-history-empty">No moves yet.</div>
          ) : (
            moveHistory.map((record) => (
              <div key={record.move_number} className="move-history-entry">
                <strong>#{record.move_number}</strong> [{record.dice_roll}]{" "}
                {record.moves_notation}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default GameInfo;
