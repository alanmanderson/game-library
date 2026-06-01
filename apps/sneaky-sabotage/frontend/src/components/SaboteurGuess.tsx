import { useState } from "react";
import type { SessionData, Player, Role, ClientMessage } from "../types/game";
import "./styles/SaboteurGuess.css";

interface SaboteurGuessProps {
  session: SessionData;
  players: Player[];
  role: Role | null;
  sendMessage: (msg: ClientMessage) => void;
}

export default function SaboteurGuess({
  session,
  players,
  role,
  sendMessage,
}: SaboteurGuessProps) {
  const [guessed, setGuessed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isSaboteur = role === "saboteur";

  const otherPlayers = players.filter((p) => p.id !== session.player_id);

  const handleGuess = (playerId: string) => {
    if (guessed || !isSaboteur) return;
    setSelectedId(playerId);
    setGuessed(true);
    sendMessage({ type: "saboteur_guess", guessed_id: playerId });
  };

  // Non-saboteur players see a waiting screen
  if (!isSaboteur) {
    return (
      <div className="saboteur-guess screen-enter">
        <div className="saboteur-guess-content">
          <div className="saboteur-guess-waiting">
            <div className="gameplay-spinner" />
            <h2 className="saboteur-guess-title">
              The Saboteur is guessing the Insider...
            </h2>
            <p className="saboteur-guess-subtitle">
              If the Saboteur guesses correctly, they earn bonus points.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="saboteur-guess screen-enter">
      <div className="saboteur-guess-content">
        <h2 className="saboteur-guess-title">Guess the Insider</h2>
        <p className="saboteur-guess-subtitle">
          Who do you think secretly knew the answer?
        </p>

        <div className="saboteur-guess-grid">
          {otherPlayers.map((p) => (
            <button
              key={p.id}
              className={`saboteur-guess-card ${
                selectedId === p.id ? "saboteur-guess-card--selected" : ""
              }`}
              onClick={() => handleGuess(p.id)}
              disabled={guessed}
            >
              <span className="saboteur-guess-card-avatar">
                {p.name.charAt(0).toUpperCase()}
              </span>
              <span className="saboteur-guess-card-name">{p.name}</span>
            </button>
          ))}
        </div>

        {guessed && (
          <p className="saboteur-guess-status">
            Guess submitted. Waiting for results...
          </p>
        )}
      </div>
    </div>
  );
}
