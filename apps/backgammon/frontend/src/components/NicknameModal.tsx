import { useState, useCallback } from "react";
import type { Player } from "../types/game";
import { createPlayer } from "../services/api";
import "./styles/NicknameModal.css";

interface NicknameModalProps {
  onPlayerCreated: (player: Player) => void;
}

function NicknameModal({ onPlayerCreated }: NicknameModalProps) {
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = nickname.trim();
      if (!trimmed) {
        setError("Please enter a nickname.");
        return;
      }
      if (trimmed.length < 2) {
        setError("Nickname must be at least 2 characters.");
        return;
      }
      if (trimmed.length > 20) {
        setError("Nickname must be 20 characters or fewer.");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const player = await createPlayer(trimmed);
        localStorage.setItem("backgammon_player", JSON.stringify(player));
        onPlayerCreated(player);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create player.");
      } finally {
        setLoading(false);
      }
    },
    [nickname, onPlayerCreated],
  );

  return (
    <div className="nickname-overlay">
      <div className="nickname-modal">
        <h2>Welcome to Backgammon</h2>
        <p>Choose a nickname to get started.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Your nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            autoFocus
            disabled={loading}
          />
          {error && <span className="error-text">{error}</span>}
          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Play"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default NicknameModal;
