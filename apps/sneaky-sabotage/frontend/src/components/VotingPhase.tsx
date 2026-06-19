import { useState } from "react";
import type {
  SessionData,
  Player,
  VotesRevealedMessage,
  ClientMessage,
} from "../types/game";
import "./styles/VotingPhase.css";

interface VotingPhaseProps {
  session: SessionData;
  players: Player[];
  voteProgress: { votes_in: number; votes_needed: number } | null;
  votesRevealed: VotesRevealedMessage | null;
  sendMessage: (msg: ClientMessage) => void;
}

export default function VotingPhase({
  session,
  players,
  voteProgress,
  votesRevealed,
  sendMessage,
}: VotingPhaseProps) {
  const [voted, setVoted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleVote = (accusedId: string) => {
    if (voted) return;
    setSelectedId(accusedId);
    setVoted(true);
    sendMessage({ type: "vote_saboteur", accused_id: accusedId });
  };

  // Filter out self
  const otherPlayers = players.filter((p) => p.id !== session.player_id);

  // If votes have been revealed, show results
  if (votesRevealed) {
    return (
      <div className="voting screen-enter">
        <div className="voting-content">
          <h2 className="voting-title">Votes Revealed</h2>

          <div className="voting-results">
            {votesRevealed.votes.map((v, i) => (
              <div key={i} className="voting-result-row">
                <span className="voting-voter">{v.voter}</span>
                <span className="voting-arrow">voted for</span>
                <span
                  className={`voting-accused ${
                    v.accused === votesRevealed.saboteur.name
                      ? "voting-accused--correct"
                      : ""
                  }`}
                >
                  {v.accused}
                </span>
              </div>
            ))}
          </div>

          <div className="voting-saboteur-reveal">
            <p className="voting-saboteur-label">The Saboteur was</p>
            <p className="voting-saboteur-name">
              {votesRevealed.saboteur.name}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="voting screen-enter">
      <div className="voting-content">
        <h2 className="voting-title">Who is the Saboteur?</h2>
        <p className="voting-subtitle">
          Vote for who you think was working against the team.
        </p>

        <div className="voting-grid">
          {otherPlayers.map((p) => (
            <button
              key={p.id}
              className={`voting-card ${
                selectedId === p.id ? "voting-card--selected" : ""
              }`}
              onClick={() => handleVote(p.id)}
              disabled={voted}
            >
              <span className="voting-card-avatar">
                {p.name.charAt(0).toUpperCase()}
              </span>
              <span className="voting-card-name">{p.name}</span>
            </button>
          ))}
        </div>

        {voteProgress && (
          <p className="voting-progress">
            {voteProgress.votes_in} / {voteProgress.votes_needed} votes cast
          </p>
        )}

        {voted && !voteProgress && (
          <p className="voting-progress">Vote submitted. Waiting for others...</p>
        )}
      </div>
    </div>
  );
}
