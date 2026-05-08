import { useState, useEffect, useCallback, useRef } from "react";
import type { Table, MoveRecord, GameStatus } from "../types/game";
import { getGameHistory } from "../services/api";
import { notationToPlayerPerspective } from "../utils/notation";
import "./styles/GameInfo.css";

const PAGE_SIZE = 1000;

const STRATEGY_LABELS: Record<string, string> = {
  gnubg: "GNU",
  opening_book: "book",
  bearoff_db: "bearoff",
  race: "race",
  v2_nn: "v2",
  v1_nn: "v1",
  heuristic: "heur",
  random: "rand",
};

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
  const loadedCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadedCountRef.current = 0;

    async function fetchInitial() {
      try {
        const data = await getGameHistory(table.id, PAGE_SIZE, 0);
        if (!cancelled) {
          setMoveHistory(data.records);
          setTotalMoves(data.total);
          loadedCountRef.current = data.records.length;
        }
      } catch {
        // silently ignore history fetch errors
      }
    }

    async function fetchNew() {
      try {
        const data = await getGameHistory(table.id, PAGE_SIZE, loadedCountRef.current);
        if (!cancelled) {
          if (data.records.length > 0) {
            setMoveHistory((prev) => [...prev, ...data.records]);
            loadedCountRef.current += data.records.length;
          }
          setTotalMoves(data.total);
        }
      } catch {
        // silently ignore history fetch errors
      }
    }

    fetchInitial();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (gameStatus !== "finished") {
      interval = setInterval(fetchNew, 5000);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [table.id, gameStatus]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const data = await getGameHistory(table.id, PAGE_SIZE, loadedCountRef.current);
      setMoveHistory((prev) => [...prev, ...data.records]);
      loadedCountRef.current += data.records.length;
      setTotalMoves(data.total);
    } catch {
      // silently ignore
    } finally {
      setLoadingMore(false);
    }
  }, [table.id]);

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
              {moveHistory.map((record) => {
                const moverColor =
                  record.player_id === table.black_player?.id
                    ? "black" as const
                    : "white" as const;
                return (
                  <div key={record.move_number} className="move-history-entry">
                    <strong>#{record.move_number}</strong>{" "}
                    {record.dice_roll ? `[${record.dice_roll}] ` : ""}
                    {notationToPlayerPerspective(record.moves_notation, moverColor)}
                    {record.bot_strategy && (
                      <span className="bot-strategy-tag" title={record.bot_strategy}>
                        {STRATEGY_LABELS[record.bot_strategy] ?? record.bot_strategy}
                      </span>
                    )}
                  </div>
                );
              })}
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
