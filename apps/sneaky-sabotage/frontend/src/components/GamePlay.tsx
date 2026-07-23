import type {
  SessionData,
  GameState,
  Role,
  Puzzle,
  ChatMessage,
  AnswerProposedMessage,
  AnswerVoteUpdateMessage,
  VotesRevealedMessage,
  RoundResultsMessage,
  Standing,
  ClientMessage,
  RoundStatus,
} from "../types/game";
import RoleReveal from "./RoleReveal";
import PuzzleSolving from "./PuzzleSolving";
import VotingPhase from "./VotingPhase";
import SaboteurGuess from "./SaboteurGuess";
import RoundResults from "./RoundResults";
import FinalScores from "./FinalScores";
import "./styles/GamePlay.css";

interface GamePlayProps {
  session: SessionData;
  gameState: GameState | null;
  role: Role | null;
  roleHint: string | null;
  roleRoundNumber: number;
  puzzle: Puzzle | null;
  timerRemaining: number | null;
  timerTotal: number;
  chatMessages: ChatMessage[];
  proposedAnswer: AnswerProposedMessage | null;
  answerVoteUpdate: AnswerVoteUpdateMessage | null;
  voteProgress: { votes_in: number; votes_needed: number } | null;
  votesRevealed: VotesRevealedMessage | null;
  isSaboteurGuessing: boolean;
  roundResults: RoundResultsMessage | null;
  finalStandings: Standing[] | null;
  readyCount: number;
  readyTotal: number;
  roundStatus: RoundStatus | "game_over" | null;
  isConnected: boolean;
  sendMessage: (msg: ClientMessage) => void;
  onLeave: () => void;
}

export default function GamePlay({
  session,
  gameState,
  role,
  roleHint,
  roleRoundNumber,
  puzzle,
  timerRemaining,
  timerTotal,
  chatMessages,
  proposedAnswer,
  answerVoteUpdate,
  voteProgress,
  votesRevealed,
  isSaboteurGuessing,
  roundResults,
  finalStandings,
  readyCount,
  readyTotal,
  roundStatus,
  isConnected,
  sendMessage,
  onLeave,
}: GamePlayProps) {
  const players = gameState?.players ?? [];
  const isHost =
    players.find((p) => p.id === session.player_id)?.is_host ?? false;

  if (roundStatus === "game_over" && finalStandings) {
    return <FinalScores standings={finalStandings} onLeave={onLeave} />;
  }

  if (roundStatus === "results" && roundResults) {
    return (
      <RoundResults
        results={roundResults}
        isHost={isHost}
        sendMessage={sendMessage}
      />
    );
  }

  if (roundStatus === "saboteur_guess") {
    return (
      <SaboteurGuess
        session={session}
        players={players}
        role={role}
        sendMessage={sendMessage}
      />
    );
  }

  if (roundStatus === "voting") {
    return (
      <VotingPhase
        session={session}
        players={players}
        voteProgress={voteProgress}
        votesRevealed={votesRevealed}
        sendMessage={sendMessage}
      />
    );
  }

  if (roundStatus === "solving" && puzzle) {
    return (
      <PuzzleSolving
        puzzle={puzzle}
        timerRemaining={timerRemaining}
        timerTotal={timerTotal}
        proposedAnswer={proposedAnswer}
        answerVoteUpdate={answerVoteUpdate}
        chatMessages={chatMessages}
        sendMessage={sendMessage}
        session={session}
      />
    );
  }

  if (roundStatus === "role_reveal" && role) {
    return (
      <RoleReveal
        role={role}
        hint={roleHint}
        roundNumber={roleRoundNumber}
        readyCount={readyCount}
        readyTotal={readyTotal}
        sendMessage={sendMessage}
      />
    );
  }

  // Fallback: waiting for state
  return (
    <div className="gameplay-waiting screen-enter">
      <div className="gameplay-waiting-content">
        <div className="gameplay-spinner" />
        <p className="gameplay-waiting-text">
          {!isConnected ? "Reconnecting..." : "Waiting for game data..."}
        </p>
      </div>
    </div>
  );
}
