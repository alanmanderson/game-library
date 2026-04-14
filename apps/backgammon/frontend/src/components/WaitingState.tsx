import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { inviteBot } from "../services/api";

interface WaitingStateProps {
  tableId: string;
  isConnected: boolean;
  waitingForOpponent: boolean;
}

function WaitingState({ tableId, isConnected, waitingForOpponent }: WaitingStateProps) {
  const [copied, setCopied] = useState(false);
  const [invitingBot, setInvitingBot] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(tableId);
    } catch {
      const el = document.createElement("input");
      el.value = tableId;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [tableId]);

  const handleInviteBot = useCallback(async () => {
    setInvitingBot(true);
    setInviteError(null);
    try {
      await inviteBot(tableId);
      // Success: WebSocket game_state arrives, parent unmounts this component.
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite bot");
      setInvitingBot(false);
    }
  }, [tableId]);

  return (
    <div className="game-page">
      <div className="game-header">
        <h2>Backgammon</h2>
        <Link to="/" className="back-link">Home</Link>
      </div>
      <div className="game-loading">
        {waitingForOpponent ? (
          <>
            <div className="spinner" />
            <p>Waiting for opponent to join...</p>
            <div className="waiting-table-id">
              <span>Share this Table ID:</span>
              <code className="table-id-code">{tableId}</code>
              <button className="copy-id-btn" onClick={handleCopy}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="waiting-or">or</div>
            <button
              className="invite-bot-btn"
              onClick={handleInviteBot}
              disabled={invitingBot}
            >
              {invitingBot ? "Inviting..." : "Play vs Bot"}
            </button>
            {inviteError && (
              <div className="game-error-banner" role="alert">{inviteError}</div>
            )}
          </>
        ) : (
          <>
            <div className="spinner" />
            <p>{isConnected ? "Loading game..." : "Connecting..."}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default WaitingState;
