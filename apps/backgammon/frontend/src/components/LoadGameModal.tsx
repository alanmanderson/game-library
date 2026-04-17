import { useState, useEffect } from "react";
import type { GameHistoryItem } from "../types/game";
import { getPlayerDashboard } from "../services/api";
import "./styles/Analysis.css";

interface Props {
  playerId: string;
  onLoadGame: (tableId: string) => void;
  onClose: () => void;
}

type LoadTab = "games" | "position";

function LoadGameModal({ playerId, onLoadGame, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<LoadTab>("games");
  const [games, setGames] = useState<GameHistoryItem[]>([]);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [positionId, setPositionId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getPlayerDashboard(playerId)
      .then((data) =>
        setGames(
          data.games
            .filter((g) => g.table_status === "finished")
            .slice(0, 20),
        ),
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [playerId]);

  const handleLoad = () => {
    if (activeTab === "games" && selectedGame) {
      onLoadGame(selectedGame);
    }
    onClose();
  };

  return (
    <div className="load-game-modal">
      <div className="load-game-modal__overlay" onClick={onClose} />
      <div className="load-game-modal__content">
        <div className="load-game-modal__header">
          <span className="load-game-modal__title">Load Game</span>
          <button className="load-game-modal__close" onClick={onClose}>
            &#x2715;
          </button>
        </div>

        <div className="load-game-modal__tabs">
          {(
            [
              { key: "games" as LoadTab, label: "My Games" },
              { key: "position" as LoadTab, label: "Position ID" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              className={`load-game-modal__tab${activeTab === key ? " load-game-modal__tab--active" : ""}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="load-game-modal__body">
          {activeTab === "games" && (
            <div className="load-game-modal__game-list">
              {loading && (
                <div style={{ color: "var(--text-secondary)", padding: 16 }}>
                  Loading games...
                </div>
              )}
              {!loading && games.length === 0 && (
                <div
                  style={{
                    color: "var(--text-secondary)",
                    padding: 16,
                    textAlign: "center",
                  }}
                >
                  No completed games found
                </div>
              )}
              {games.map((g) => (
                <div
                  key={g.table_id}
                  className={`load-game-modal__game-item${selectedGame === g.table_id ? " load-game-modal__game-item--selected" : ""}`}
                  onClick={() => setSelectedGame(g.table_id)}
                >
                  <div className="load-game-modal__game-info">
                    <span className="load-game-modal__game-date">
                      {new Date(g.played_at).toLocaleDateString()}
                    </span>
                    <span className="load-game-modal__game-opponent">
                      vs {g.opponent_nickname}
                    </span>
                  </div>
                  <span
                    className={`load-game-modal__game-result load-game-modal__game-result--${g.result}`}
                  >
                    {g.result === "win" ? "W" : "L"}
                    {g.win_type && g.win_type !== "normal"
                      ? ` (${g.win_type})`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeTab === "position" && (
            <div className="load-game-modal__input-group">
              <label className="load-game-modal__input-label">
                gnubg Position ID
              </label>
              <input
                className="load-game-modal__input"
                placeholder="e.g. 4HPwATDgc/ABMA"
                value={positionId}
                onChange={(e) => setPositionId(e.target.value)}
              />
              <div className="load-game-modal__divider">
                Position ID loading coming soon
              </div>
            </div>
          )}
        </div>

        <div className="load-game-modal__footer">
          <button className="analysis__btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="analysis__btn analysis__btn--primary"
            onClick={handleLoad}
            disabled={
              activeTab === "games" ? !selectedGame : !positionId
            }
          >
            Load
          </button>
        </div>
      </div>
    </div>
  );
}

export default LoadGameModal;
