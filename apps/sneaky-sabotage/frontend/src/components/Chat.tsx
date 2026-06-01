import { useState, useRef, useEffect } from "react";
import type { ChatMessage, ClientMessage } from "../types/game";
import "./styles/Chat.css";

interface ChatProps {
  messages: ChatMessage[];
  sendMessage: (msg: ClientMessage) => void;
  onClose: () => void;
  currentPlayerId: string;
}

// Deterministic color from player ID
const CHAT_COLORS = [
  "#3498db",
  "#e74c3c",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#e84393",
];

function getPlayerColor(playerId: string): string {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = (hash * 31 + playerId.charCodeAt(i)) | 0;
  }
  return CHAT_COLORS[Math.abs(hash) % CHAT_COLORS.length];
}

export default function Chat({
  messages,
  sendMessage,
  onClose,
  currentPlayerId,
}: ChatProps) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage({ type: "chat", message: trimmed });
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-overlay">
      <div className="chat-panel">
        <div className="chat-header">
          <h3 className="chat-title">Chat</h3>
          <button
            className="chat-close"
            onClick={onClose}
            aria-label="Close chat"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="chat-messages" ref={scrollRef}>
          {messages.length === 0 && (
            <p className="chat-empty">No messages yet. Say something!</p>
          )}
          {messages.map((msg, i) => {
            const isOwn = msg.player_id === currentPlayerId;
            return (
              <div
                key={i}
                className={`chat-message ${isOwn ? "chat-message--own" : ""}`}
              >
                {!isOwn && (
                  <span
                    className="chat-message-name"
                    style={{ color: getPlayerColor(msg.player_id) }}
                  >
                    {msg.player_name}
                  </span>
                )}
                <span className="chat-message-text">{msg.message}</span>
              </div>
            );
          })}
        </div>

        <div className="chat-input-bar">
          <input
            className="chat-input"
            type="text"
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoFocus
          />
          <button
            className="btn btn-primary chat-send"
            onClick={handleSend}
            disabled={!text.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
