import { useState, useCallback, useEffect, useRef } from "react";
import HomeScreen from "./components/HomeScreen";
import Lobby from "./components/Lobby";
import GamePlay from "./components/GamePlay";
import type {
  SessionData,
  GameState,
  WSMessage,
  RoleAssignedMessage,
  PuzzleStartMessage,
  RoundResultsMessage,
  GameOverMessage,
  ChatMessage,
  AnswerProposedMessage,
  AnswerVoteUpdateMessage,
  VoteCastMessage,
  VotesRevealedMessage,
  Puzzle,
  Role,
  Standing,
  PlayerScore,
  VoteEntry,
  SaboteurInfo,
} from "./types/game";
import { useWebSocket } from "./hooks/useWebSocket";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "sneaky_sabotage_session";

type Screen = "home" | "lobby" | "game";

// ---------------------------------------------------------------------------
// Toast system
// ---------------------------------------------------------------------------

interface Toast {
  id: number;
  message: string;
  variant: "error" | "success" | "info";
}

let toastId = 0;

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  // -- Session state -------------------------------------------------------
  const [screen, setScreen] = useState<Screen>("home");
  const [session, setSession] = useState<SessionData | null>(null);

  // -- Game state ----------------------------------------------------------
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [roleHint, setRoleHint] = useState<string | null>(null);
  const [roleRoundNumber, setRoleRoundNumber] = useState<number>(0);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [timerTotal, setTimerTotal] = useState<number>(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Answer proposal state
  const [proposedAnswer, setProposedAnswer] = useState<AnswerProposedMessage | null>(null);
  const [answerVoteUpdate, setAnswerVoteUpdate] = useState<AnswerVoteUpdateMessage | null>(null);

  // Voting phase state
  const [voteProgress, setVoteProgress] = useState<{ votes_in: number; votes_needed: number } | null>(null);
  const [votesRevealed, setVotesRevealed] = useState<VotesRevealedMessage | null>(null);

  // Saboteur guess
  const [isSaboteurGuessing, setIsSaboteurGuessing] = useState(false);

  // Round results
  const [roundResults, setRoundResults] = useState<RoundResultsMessage | null>(null);

  // Game over
  const [finalStandings, setFinalStandings] = useState<Standing[] | null>(null);

  // Ready count
  const [readyCount, setReadyCount] = useState(0);
  const [readyTotal, setReadyTotal] = useState(0);

  // -- Toast helper --------------------------------------------------------
  const addToast = useCallback(
    (message: string, variant: "error" | "success" | "info" = "error") => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  // -- Restore session from localStorage -----------------------------------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as SessionData;
        if (saved.game_id && saved.player_id && saved.session_token) {
          setSession(saved);
          setScreen("lobby"); // will upgrade to "game" once we get game_state
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // -- Save session to localStorage ----------------------------------------
  const saveSession = useCallback((data: SessionData) => {
    setSession(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
    setGameState(null);
    setRole(null);
    setRoleHint(null);
    setPuzzle(null);
    setTimerRemaining(null);
    setChatMessages([]);
    setProposedAnswer(null);
    setAnswerVoteUpdate(null);
    setVoteProgress(null);
    setVotesRevealed(null);
    setIsSaboteurGuessing(false);
    setRoundResults(null);
    setFinalStandings(null);
    setReadyCount(0);
    setReadyTotal(0);
    localStorage.removeItem(STORAGE_KEY);
    setScreen("home");
  }, []);

  // -- WebSocket URL -------------------------------------------------------
  const wsUrl = session
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/${session.game_id}/${session.player_id}?token=${session.session_token}`
    : null;

  // -- WebSocket message handler -------------------------------------------
  const handleMessage = useCallback(
    (msg: WSMessage) => {
      switch (msg.type) {
        case "game_state": {
          setGameState({
            game_id: msg.game_id,
            status: msg.status,
            current_round: msg.current_round,
            max_rounds: msg.max_rounds,
            timer_seconds: msg.timer_seconds,
            players: msg.players,
            round_status: msg.round_status,
            round_number: msg.round_number,
            timer_remaining: msg.timer_remaining,
          });
          if (msg.status === "playing") {
            setScreen("game");
          } else if (msg.status === "lobby") {
            setScreen("lobby");
          }
          if (msg.timer_remaining != null) {
            setTimerRemaining(msg.timer_remaining);
          }
          break;
        }

        case "role_assigned":
          setRole(msg.role);
          setRoleHint(msg.hint ?? null);
          setRoleRoundNumber(msg.round_number);
          setReadyCount(0);
          setReadyTotal(0);
          // Reset per-round state
          setPuzzle(null);
          setTimerRemaining(null);
          setProposedAnswer(null);
          setAnswerVoteUpdate(null);
          setVoteProgress(null);
          setVotesRevealed(null);
          setIsSaboteurGuessing(false);
          setRoundResults(null);
          setScreen("game");
          break;

        case "player_ready":
          setReadyCount(msg.ready_count);
          setReadyTotal(msg.total_count);
          break;

        case "puzzle_start":
          setPuzzle(msg.puzzle);
          setTimerRemaining(msg.timer_seconds);
          setTimerTotal(msg.timer_seconds);
          setProposedAnswer(null);
          setAnswerVoteUpdate(null);
          break;

        case "timer_update":
          setTimerRemaining(msg.remaining);
          break;

        case "answer_proposed":
          setProposedAnswer(msg);
          setAnswerVoteUpdate(null);
          break;

        case "answer_vote_update":
          setAnswerVoteUpdate(msg);
          break;

        case "answer_result":
          setProposedAnswer(null);
          setAnswerVoteUpdate(null);
          if (msg.is_correct) {
            addToast("Correct answer!", "success");
          } else {
            addToast("Wrong answer. Keep trying!", "error");
          }
          break;

        case "answer_rejected":
          setProposedAnswer(null);
          setAnswerVoteUpdate(null);
          addToast(msg.message, "info");
          break;

        case "time_expired":
          addToast("Time is up!", "error");
          break;

        case "voting_phase":
          setVoteProgress(null);
          setVotesRevealed(null);
          break;

        case "vote_cast":
          setVoteProgress({ votes_in: msg.votes_in, votes_needed: msg.votes_needed });
          break;

        case "votes_revealed":
          setVotesRevealed(msg);
          break;

        case "guess_insider":
          setIsSaboteurGuessing(true);
          break;

        case "round_results":
          setRoundResults(msg);
          break;

        case "game_over":
          setFinalStandings(msg.standings);
          break;

        case "player_joined":
          addToast(`${msg.player_name} joined`, "info");
          break;

        case "player_left":
          if (msg.player_name) {
            addToast(`${msg.player_name} left`, "info");
          }
          break;

        case "chat":
          setChatMessages((prev) => [
            ...prev,
            {
              player_id: msg.player_id,
              player_name: msg.player_name,
              message: msg.message,
              timestamp: Date.now(),
            },
          ]);
          break;

        case "kicked":
          addToast(msg.message, "error");
          clearSession();
          break;

        case "error":
          addToast(msg.message, "error");
          break;
      }
    },
    [addToast, clearSession],
  );

  const { sendMessage, isConnected } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
  });

  // -- Determine current round status for GamePlay -------------------------
  const roundStatus = (() => {
    if (finalStandings) return "game_over" as const;
    if (roundResults) return "results" as const;
    if (isSaboteurGuessing) return "saboteur_guess" as const;
    if (votesRevealed || voteProgress || gameState?.round_status === "voting")
      return "voting" as const;
    if (puzzle) return "solving" as const;
    if (role && !puzzle) return "role_reveal" as const;
    return gameState?.round_status ?? null;
  })();

  // -- Render --------------------------------------------------------------
  return (
    <>
      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.variant}`}>
              {t.message}
            </div>
          ))}
        </div>
      )}

      {screen === "home" && (
        <HomeScreen
          onSessionCreated={(data) => {
            saveSession(data);
            setScreen("lobby");
          }}
        />
      )}

      {screen === "lobby" && session && (
        <Lobby
          session={session}
          gameState={gameState}
          isConnected={isConnected}
          sendMessage={sendMessage}
          onLeave={clearSession}
        />
      )}

      {screen === "game" && session && (
        <GamePlay
          session={session}
          gameState={gameState}
          role={role}
          roleHint={roleHint}
          roleRoundNumber={roleRoundNumber}
          puzzle={puzzle}
          timerRemaining={timerRemaining}
          timerTotal={timerTotal}
          chatMessages={chatMessages}
          proposedAnswer={proposedAnswer}
          answerVoteUpdate={answerVoteUpdate}
          voteProgress={voteProgress}
          votesRevealed={votesRevealed}
          isSaboteurGuessing={isSaboteurGuessing}
          roundResults={roundResults}
          finalStandings={finalStandings}
          readyCount={readyCount}
          readyTotal={readyTotal}
          roundStatus={roundStatus}
          isConnected={isConnected}
          sendMessage={sendMessage}
          onLeave={clearSession}
        />
      )}
    </>
  );
}
