/* =========================================================================
   Type definitions for Sneaky Sabotage
   ========================================================================= */

// ---------------------------------------------------------------------------
// Session & player
// ---------------------------------------------------------------------------

export interface SessionData {
  game_id: string;
  player_id: string;
  session_token: string;
}

export interface Player {
  id: string;
  name: string;
  is_host: boolean;
  connected: boolean;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type Role = "agent" | "saboteur" | "insider";

// ---------------------------------------------------------------------------
// Puzzle types
// ---------------------------------------------------------------------------

export type PuzzleType =
  | "caesar_cipher"
  | "number_code"
  | "anagram"
  | "reverse_message"
  | "first_letters"
  | "keyboard_shift"
  | "missing_vowels"
  | "morse_code"
  | "letter_math"
  | "word_chain";

export interface CaesarCipherContent {
  text: string;
  shift: number;
}

export interface NumberCodeContent {
  numbers: number[];
}

export interface AnagramContent {
  letters: string;
}

export interface ReverseMessageContent {
  text: string;
}

export interface FirstLettersContent {
  sentences: string[];
}

export interface KeyboardShiftContent {
  text: string;
  direction: string;
  positions: number;
}

export interface MissingVowelsContent {
  text: string;
}

export interface MorseCodeContent {
  code: string;
}

export interface LetterMathContent {
  equations: string[];
}

export interface WordChainContent {
  clues: string[];
}

export type PuzzleContent =
  | CaesarCipherContent
  | NumberCodeContent
  | AnagramContent
  | ReverseMessageContent
  | FirstLettersContent
  | KeyboardShiftContent
  | MissingVowelsContent
  | MorseCodeContent
  | LetterMathContent
  | WordChainContent;

export interface Puzzle {
  id: string;
  type: PuzzleType;
  title: string;
  instructions: string;
  content: PuzzleContent;
  difficulty: string;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type GameStatus = "lobby" | "playing" | "finished";

export type RoundStatus =
  | "role_reveal"
  | "solving"
  | "voting"
  | "saboteur_guess"
  | "results";

export interface GameState {
  game_id: string;
  status: GameStatus;
  current_round: number;
  max_rounds: number;
  timer_seconds: number;
  players: Player[];
  round_status?: RoundStatus;
  round_number?: number;
  timer_remaining?: number;
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

export interface PlayerScore {
  name: string;
  round_score: number;
  total_score: number;
}

export interface Standing {
  id: string;
  name: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Vote info
// ---------------------------------------------------------------------------

export interface VoteEntry {
  voter: string;
  accused: string;
}

export interface SaboteurInfo {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface ChatMessage {
  player_id: string;
  player_name: string;
  message: string;
  timestamp?: number;
}

// ---------------------------------------------------------------------------
// WebSocket messages FROM server
// ---------------------------------------------------------------------------

export interface GameStateMessage {
  type: "game_state";
  game_id: string;
  status: GameStatus;
  current_round: number;
  max_rounds: number;
  timer_seconds: number;
  players: Player[];
  round_status?: RoundStatus;
  round_number?: number;
  timer_remaining?: number;
}

export interface RoleAssignedMessage {
  type: "role_assigned";
  role: Role;
  round_number: number;
  hint?: string;
}

export interface PlayerReadyMessage {
  type: "player_ready";
  player_id: string;
  ready_count: number;
  total_count: number;
}

export interface PuzzleStartMessage {
  type: "puzzle_start";
  puzzle: Puzzle;
  timer_seconds: number;
}

export interface TimerUpdateMessage {
  type: "timer_update";
  remaining: number;
}

export interface AnswerProposedMessage {
  type: "answer_proposed";
  player_name: string;
  answer: string;
  votes_for: number;
  votes_against: number;
  votes_needed: number;
}

export interface AnswerVoteUpdateMessage {
  type: "answer_vote_update";
  votes_for: number;
  votes_against: number;
  votes_needed: number;
  total_voted: number;
  total_players: number;
}

export interface AnswerResultMessage {
  type: "answer_result";
  answer: string;
  is_correct: boolean;
}

export interface AnswerRejectedMessage {
  type: "answer_rejected";
  message: string;
}

export interface TimeExpiredMessage {
  type: "time_expired";
}

export interface VotingPhaseMessage {
  type: "voting_phase";
  message: string;
}

export interface VoteCastMessage {
  type: "vote_cast";
  votes_in: number;
  votes_needed: number;
}

export interface VotesRevealedMessage {
  type: "votes_revealed";
  votes: VoteEntry[];
  saboteur: SaboteurInfo;
  has_insider: boolean;
}

export interface GuessInsiderMessage {
  type: "guess_insider";
  message: string;
}

export interface RoundResultsMessage {
  type: "round_results";
  round_number: number;
  puzzle_correct: boolean;
  answer_submitted: string;
  correct_answer: string;
  saboteur: SaboteurInfo;
  insider: SaboteurInfo | null;
  scores: Record<string, PlayerScore>;
  vote_counts: Record<string, number>;
  events: string[];
  roles: Record<string, Role>;
}

export interface GameOverMessage {
  type: "game_over";
  standings: Standing[];
  game_id: string;
}

export interface PlayerJoinedMessage {
  type: "player_joined";
  player_id: string;
  player_name: string;
}

export interface PlayerLeftMessage {
  type: "player_left";
  player_id: string;
  player_name?: string;
}

export interface ServerChatMessage {
  type: "chat";
  player_id: string;
  player_name: string;
  message: string;
}

export interface KickedMessage {
  type: "kicked";
  message: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export type WSMessage =
  | GameStateMessage
  | RoleAssignedMessage
  | PlayerReadyMessage
  | PuzzleStartMessage
  | TimerUpdateMessage
  | AnswerProposedMessage
  | AnswerVoteUpdateMessage
  | AnswerResultMessage
  | AnswerRejectedMessage
  | TimeExpiredMessage
  | VotingPhaseMessage
  | VoteCastMessage
  | VotesRevealedMessage
  | GuessInsiderMessage
  | RoundResultsMessage
  | GameOverMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | ServerChatMessage
  | KickedMessage
  | ErrorMessage;

// ---------------------------------------------------------------------------
// WebSocket messages TO server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { type: "start_game" }
  | { type: "ready" }
  | { type: "propose_answer"; answer: string }
  | { type: "vote_answer"; approve: boolean }
  | { type: "vote_saboteur"; accused_id: string }
  | { type: "saboteur_guess"; guessed_id: string }
  | { type: "next_round" }
  | { type: "chat"; message: string }
  | { type: "update_settings"; timer_seconds?: number; max_rounds?: number }
  | { type: "kick_player"; player_id: string };

// ---------------------------------------------------------------------------
// API responses
// ---------------------------------------------------------------------------

export interface CreateGameResponse {
  game_id: string;
  player_id: string;
  session_token: string;
}

export interface JoinGameResponse {
  game_id: string;
  player_id: string;
  session_token: string;
}

export interface GetGameResponse {
  id: string;
  status: GameStatus;
  current_round: number;
  max_rounds: number;
  timer_seconds: number;
  players: Player[];
}
