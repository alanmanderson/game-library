import { useState, useRef, useEffect, useCallback } from "react";
import type { ChatMessage } from "../types/game";
import "./styles/ChatPanel.css";

const QUICK_MESSAGES = ["Good game", "Nice move", "Good luck"];

interface ChatPanelProps {
  chatMessages: ChatMessage[];
  onSendChat: (message: string) => void;
  playerId: string | undefined;
}

function ChatPanel({ chatMessages, onSendChat, playerId }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [lastSeenCount, setLastSeenCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const unreadCount = isOpen ? 0 : chatMessages.length - lastSeenCount;

  // Auto-scroll to bottom when new messages arrive and panel is open
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages.length, isOpen]);

  // Mark messages as seen when panel opens
  useEffect(() => {
    if (isOpen) {
      setLastSeenCount(chatMessages.length);
    }
  }, [isOpen, chatMessages.length]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    onSendChat(text);
    setInputValue("");
  }, [inputValue, onSendChat]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleQuickMessage = useCallback(
    (msg: string) => {
      onSendChat(msg);
    },
    [onSendChat],
  );

  const toggleOpen = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const displayedMessages = isMuted
    ? chatMessages.filter((m) => m.player_id === playerId)
    : chatMessages;

  return (
    <div className={`chat-panel ${isOpen ? "chat-panel-open" : ""}`}>
      <button className="chat-toggle-btn" onClick={toggleOpen} title="Toggle chat">
        <span className="chat-icon">&#x1F4AC;</span>
        {!isOpen && unreadCount > 0 && (
          <span className="chat-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="chat-body">
          <div className="chat-header">
            <span className="chat-title">Chat</span>
            <label className="chat-mute-label">
              <input
                type="checkbox"
                checked={isMuted}
                onChange={toggleMute}
                className="chat-mute-checkbox"
              />
              Mute
            </label>
          </div>

          <div className="chat-messages">
            {displayedMessages.length === 0 && (
              <div className="chat-empty">No messages yet</div>
            )}
            {displayedMessages.map((msg, i) => {
              const isMe = msg.player_id === playerId;
              return (
                <div
                  key={i}
                  className={`chat-message ${isMe ? "chat-message-mine" : "chat-message-theirs"}`}
                >
                  <span className="chat-sender">{isMe ? "You" : msg.nickname}</span>
                  <span className="chat-text">{msg.message}</span>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-quick-messages">
            {QUICK_MESSAGES.map((msg) => (
              <button
                key={msg}
                className="chat-quick-btn"
                onClick={() => handleQuickMessage(msg)}
              >
                {msg}
              </button>
            ))}
          </div>

          <div className="chat-input-row">
            <input
              type="text"
              className="chat-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.slice(0, 200))}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              maxLength={200}
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!inputValue.trim()}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatPanel;
