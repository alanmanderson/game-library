import { useState } from "react";
import type { Role, ClientMessage } from "../types/game";
import "./styles/RoleReveal.css";

interface RoleRevealProps {
  role: Role;
  hint: string | null;
  roundNumber: number;
  readyCount: number;
  readyTotal: number;
  sendMessage: (msg: ClientMessage) => void;
}

const ROLE_CONFIG: Record<
  Role,
  { label: string; description: string; cssClass: string }
> = {
  agent: {
    label: "Agent",
    description: "You are an Agent. Work together to solve the puzzle and find the Saboteur!",
    cssClass: "role-reveal--agent",
  },
  saboteur: {
    label: "Saboteur",
    description: "You are the Saboteur! Mislead the team without getting caught.",
    cssClass: "role-reveal--saboteur",
  },
  insider: {
    label: "Insider",
    description: "You are the Insider. Subtly guide the team to the answer without revealing yourself.",
    cssClass: "role-reveal--insider",
  },
};

export default function RoleReveal({
  role,
  hint,
  roundNumber,
  readyCount,
  readyTotal,
  sendMessage,
}: RoleRevealProps) {
  const [isReady, setIsReady] = useState(false);
  const config = ROLE_CONFIG[role];

  const handleReady = () => {
    if (isReady) return;
    setIsReady(true);
    sendMessage({ type: "ready" });
  };

  return (
    <div className={`role-reveal ${config.cssClass} screen-enter`}>
      <div className="role-reveal-content">
        <p className="role-reveal-round">Round {roundNumber}</p>

        <div className="role-reveal-card">
          <h1 className="role-reveal-label">{config.label}</h1>
          <p className="role-reveal-description">{config.description}</p>

          {hint && (
            <div className="role-reveal-hint">
              <span className="role-reveal-hint-label">Secret Hint</span>
              <p className="role-reveal-hint-text">{hint}</p>
            </div>
          )}
        </div>

        <div className="role-reveal-footer">
          <button
            className="btn btn-primary role-reveal-ready-btn"
            onClick={handleReady}
            disabled={isReady}
          >
            {isReady ? "Waiting for others..." : "I'm Ready"}
          </button>
          {readyTotal > 0 && (
            <p className="role-reveal-count">
              {readyCount} / {readyTotal} players ready
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
