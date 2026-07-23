import { useState } from "react";
import type {
  Puzzle,
  ChatMessage,
  AnswerProposedMessage,
  AnswerVoteUpdateMessage,
  ClientMessage,
  SessionData,
} from "../types/game";
import PuzzleRenderer from "./PuzzleRenderer";
import Chat from "./Chat";
import "./styles/PuzzleSolving.css";

interface PuzzleSolvingProps {
  puzzle: Puzzle;
  timerRemaining: number | null;
  timerTotal: number;
  proposedAnswer: AnswerProposedMessage | null;
  answerVoteUpdate: AnswerVoteUpdateMessage | null;
  chatMessages: ChatMessage[];
  sendMessage: (msg: ClientMessage) => void;
  session: SessionData;
}

export default function PuzzleSolving({
  puzzle,
  timerRemaining,
  timerTotal,
  proposedAnswer,
  answerVoteUpdate,
  chatMessages,
  sendMessage,
  session,
}: PuzzleSolvingProps) {
  const [answer, setAnswer] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  const remaining = timerRemaining ?? 0;
  const fraction = timerTotal > 0 ? remaining / timerTotal : 1;
  const isUrgent = remaining <= 30;

  const handlePropose = () => {
    const trimmed = answer.trim();
    if (!trimmed) return;
    sendMessage({ type: "propose_answer", answer: trimmed });
    setAnswer("");
  };

  const handleVote = (approve: boolean) => {
    sendMessage({ type: "vote_answer", approve });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handlePropose();
    }
  };

  // Format seconds as M:SS
  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const voteInfo = answerVoteUpdate ?? proposedAnswer;

  return (
    <div className="puzzle-solving screen-enter">
      {/* Timer bar */}
      <div className={`puzzle-timer ${isUrgent ? "puzzle-timer--urgent" : ""}`}>
        <div
          className="puzzle-timer-bar"
          style={{ width: `${fraction * 100}%` }}
        />
        <span className="puzzle-timer-text">{formatTime(remaining)}</span>
      </div>

      <div className="puzzle-solving-body">
        {/* Puzzle header */}
        <div className="puzzle-header">
          <h2 className="puzzle-title">{puzzle.title}</h2>
          <p className="puzzle-instructions">{puzzle.instructions}</p>
          <span className="puzzle-difficulty">{puzzle.difficulty}</span>
        </div>

        {/* Puzzle content */}
        <PuzzleRenderer puzzle={puzzle} />

        {/* Answer proposal overlay */}
        {proposedAnswer && (
          <div className="puzzle-proposal">
            <p className="puzzle-proposal-header">
              <strong>{proposedAnswer.player_name}</strong> proposes:
            </p>
            <p className="puzzle-proposal-answer">
              &ldquo;{proposedAnswer.answer}&rdquo;
            </p>
            <div className="puzzle-proposal-votes">
              <button
                className="btn btn-success puzzle-vote-btn"
                onClick={() => handleVote(true)}
              >
                Approve ({voteInfo?.votes_for ?? 0})
              </button>
              <button
                className="btn btn-danger puzzle-vote-btn"
                onClick={() => handleVote(false)}
              >
                Reject ({voteInfo?.votes_against ?? 0})
              </button>
            </div>
            {answerVoteUpdate && (
              <p className="puzzle-proposal-progress">
                {answerVoteUpdate.total_voted} / {answerVoteUpdate.total_players}{" "}
                voted
              </p>
            )}
          </div>
        )}

        {/* Answer input */}
        {!proposedAnswer && (
          <div className="puzzle-answer-bar">
            <input
              className="puzzle-answer-input"
              type="text"
              placeholder="Type your answer..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
            <button
              className="btn btn-primary puzzle-answer-submit"
              onClick={handlePropose}
              disabled={!answer.trim()}
            >
              Propose
            </button>
          </div>
        )}
      </div>

      {/* Chat toggle */}
      <button
        className="puzzle-chat-toggle"
        onClick={() => setChatOpen(!chatOpen)}
        aria-label={chatOpen ? "Close chat" : "Open chat"}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {chatMessages.length > 0 && (
          <span className="puzzle-chat-badge">{chatMessages.length}</span>
        )}
      </button>

      {/* Chat panel */}
      {chatOpen && (
        <Chat
          messages={chatMessages}
          sendMessage={sendMessage}
          onClose={() => setChatOpen(false)}
          currentPlayerId={session.player_id}
        />
      )}
    </div>
  );
}
