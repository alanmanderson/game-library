import { useState, useCallback, useRef } from "react";
import { inviteBot } from "../services/api";

interface WaitingOverlayProps {
  tableId: string;
}

function WaitingOverlay({ tableId }: WaitingOverlayProps) {
  const [copied, setCopied] = useState(false);
  const [invitingBot, setInvitingBot] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite bot");
      setInvitingBot(false);
    }
  }, [tableId]);

  return (
    <div className="board-overlay-right">
      <div className="win-banner waiting-banner">
        <div className="spinner" />
        <p className="waiting-banner-title">Waiting for opponent...</p>
        <div className="waiting-table-id">
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
      </div>
    </div>
  );
}

export default WaitingOverlay;
