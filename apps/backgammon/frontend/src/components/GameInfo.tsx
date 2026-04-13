import { useState, useEffect, useCallback } from "react";
import type { Table, MoveRecord, GameStatus } from "../types/game";
import { getGameHistory } from "../services/api";
import "./styles/GameInfo.css";

const PAGE_SIZE = 50;

interface GameInfoProps {
  table: Table;
  gameStatus: GameStatus;
  isOpen?: boolean;
  onToggle?: () => void;
}

function GameInfo({ table, gameStatus, isOpen: externalIsOpen, onToggle }: GameInfoProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const toggleOpen = onToggle ?? (() => setInternalIsOpen((prev) => !prev));
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  const [totalMoves, setTotalMoves] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      try {
        const data = await getGameHistory(table.id, PAGE_SIZE, 0);
        if (!cancelled) {
          setMoveHistory(data.records);
          setTotalMoves(data.total);
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

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const data = await getGameHistory(table.id, PAGE_SIZE, moveHistory.length);
      setMoveHistory((prev) => [...prev, ...data.records]);
      setTotalMoves(data.total);
    } catch {
      // silently ignore
    } finally {
      setLoadingMore(false);
    }
  }, [table.id, moveHistory.length]);

  const hasMore = moveHistory.length < totalMoves;

  return (
    <div className="move-history-drawer">
      <button
        className={`drawer-toggle ${isOpen ? "open" : ""}`}
        onClick={toggleOpen}
        title="Toggle move history (M)"
      >
        <span className="drawer-arrow">{isOpen ? "\u25BC" : "\u25B6"}</span>
        Move History
        {totalMoves > 0 && (
          <span className="move-count">({totalMoves})</span>
        )}
      </button>
      {isOpen && (
        <div className="move-history">
          {moveHistory.length === 0 ? (
            <div className="move-history-empty">No moves yet.</div>
          ) : (
            <>
              {moveHistory.map((record) => (
                <div key={record.move_number} className="move-history-entry">
                  <strong>#{record.move_number}</strong> [{record.dice_roll}]{" "}
                  {record.moves_notation}
                </div>
              ))}
              {hasMore && (
                <button
                  className="load-more-btn"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading..." : `Load More (${totalMoves - moveHistory.length} remaining)`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default GameInfo;
