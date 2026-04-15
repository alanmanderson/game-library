/**
 * TypeScript type definitions for the multiplayer backgammon game.
 *
 * These types mirror the backend (FastAPI) models and WebSocket message
 * schemas so that the frontend can work with strongly-typed data throughout.
 */

/** Checker / player color. */
export type Color = "white" | "black";

/** High-level phase the game is currently in. */
export type GameStatus = "waiting" | "rolling" | "moving" | "finished" | "game_over";

/** How a game was won – affects point scoring in match play. */
export type WinType = "normal" | "gammon" | "backgammon";

/** Bot difficulty levels. */
export type BotDifficulty = "easy" | "medium" | "hard" | "expert";

/** Time control modes. */
export type TimeControl = "blitz" | "rapid" | "classical" | "unlimited";

// ---------------------------------------------------------------------------
// Domain models
// ---------------------------------------------------------------------------

/** A registered player. */
export interface Player {
  id: string;
  nickname: string;
  created_at: string;
  is_guest?: boolean;
  auth_provider?: string;
  rating?: number;
  rating_games?: number;
  /** League tier derived from rating (Bronze/Silver/Gold/Platinum/Diamond). */
  tier?: string;
  /** Cosmetic preference: board theme ID (see `constants/themes.ts`). */
  board_theme?: string;
  /** Cosmetic preference: checker style ID (see `constants/themes.ts`). */
  checker_style?: string;
  /** Accumulated daily/weekly challenge reward points. */
  challenge_points?: number;
}

/** A daily or weekly challenge with the current player's progress. */
export interface ChallengeProgress {
  id: string;
  name: string;
  description: string;
  type: "daily" | "weekly";
  target: number;
  metric: string;
  reward_points: number;
  progress: number;
  completed_at: string | null;
  period_key: string;
}

/** Aggregate response for GET /api/challenges/me. */
export interface ChallengesData {
  daily: ChallengeProgress[];
  weekly: ChallengeProgress[];
  challenge_points: number;
}

/** Partial update payload for PATCH /api/players/me/preferences. */
export interface PlayerPreferencesUpdate {
  board_theme?: string;
  checker_style?: string;
}

/** Response from auth endpoints (register, login, google, guest). */
export interface AuthResponse {
  token: string;
  player: Player;
}

/** A pair of dice values (1-6 each). */
export interface DiceRoll {
  die1: number;
  die2: number;
}

/**
 * A single checker movement.
 *
 * Point numbering:
 *  - 1-24 : standard board points
 *  - 0    : the bar for black / bearing-off destination for white
 *  - 25   : the bar for white / bearing-off destination for black
 */
export interface Move {
  from_point: number;
  to_point: number;
  is_hit: boolean;
}

/** The full mutable state of a backgammon game. */
export interface GameState {
  /**
   * 26-element array representing the board.
   * Indices 1-24 are the playable points.
   * Positive values = white checkers, negative values = black checkers.
   * Indices 0 and 25 are unused in display (bar / off are tracked separately).
   */
  points: number[];
  bar_white: number;
  bar_black: number;
  off_white: number;
  off_black: number;
  current_turn: Color;
  dice: DiceRoll | null;
  remaining_dice: number[];
  status: GameStatus;
  valid_moves: Move[];
  winner: Color | null;
  win_type: WinType | null;
  opening_roll: { white: number; black: number } | null;
  turn_moves_count: number;
  can_undo: boolean;
  cube_value: number;
  cube_owner: Color | null;
  double_offered: boolean;
  double_offered_by: Color | null;
  can_double: boolean;
  is_crawford_game: boolean;
  pip_white?: number;
  pip_black?: number;
  time_control?: string;
  white_time_remaining_ms?: number | null;
  black_time_remaining_ms?: number | null;
}

/** A table (lobby / game room) that two players can join. */
export interface Table {
  id: string;
  status: string;
  white_player: Player | null;
  black_player: Player | null;
  created_at: string;
  match_points: number;
  white_match_score: number;
  black_match_score: number;
  bot_difficulty?: string;
  is_public?: boolean;
  time_control?: string;
  white_time_remaining_ms?: number | null;
  black_time_remaining_ms?: number | null;
  spectator_count?: number;
  is_ranked?: boolean;
}

/** A public table shown in the game lobby. */
export interface LobbyTable {
  id: string;
  creator_nickname: string;
  match_points: number | null;
  preferred_color: string | null;
  created_at: string;
  is_ranked?: boolean;
}

/** A table with an active game in progress, shown in the spectator lobby. */
export interface ActiveGame {
  id: string;
  white_player_nickname: string;
  black_player_nickname: string;
  match_points: number | null;
  white_match_score: number;
  black_match_score: number;
  spectator_count: number;
  created_at: string;
  is_ranked?: boolean;
}

/** A ranked-play season with defined start/end dates. */
export interface Season {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

/** A single row in the move-history log for a completed turn. */
export interface MoveRecord {
  move_number: number;
  dice_roll: string;
  moves_notation: string;
  created_at: string;
}

/** Paginated response for move history. */
export interface PaginatedMoveHistory {
  total: number;
  limit: number;
  offset: number;
  records: MoveRecord[];
}

/** Extended move record for replay with full board snapshot. */
export interface ReplayMoveRecord {
  move_number: number;
  player_nickname: string | null;
  dice_roll: string;
  moves_notation: string;
  game_state_after: GameState | null;
  created_at: string;
}

/** Full replay data for a completed game. */
export interface ReplayData {
  table_id: string;
  status: string;
  white_player_nickname: string | null;
  black_player_nickname: string | null;
  winner_color?: "white" | "black" | null;
  winner_nickname?: string | null;
  win_type?: WinType | null;
  final_score?: number | null;
  white_match_score?: number | null;
  black_match_score?: number | null;
  match_points?: number | null;
  initial_state: GameState;
  moves: ReplayMoveRecord[];
}

/** Quality classification for a single move. */
export type MoveQuality = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

/** Per-move analysis entry produced by the backend analysis service. */
export interface MoveAnalysis {
  move_number: number;
  player_color: "white" | "black";
  player_nickname: string | null;
  dice_roll: string;
  moves_notation: string;
  equity_before: number;
  equity_after: number;
  best_equity: number;
  equity_loss: number;
  quality: MoveQuality;
  best_move_notation: string | null;
}

/** Full analysis payload for a completed game. */
export interface AnalysisData {
  table_id: string;
  ml_available: boolean;
  moves_analysed: number;
  total_moves: number;
  move_analyses: MoveAnalysis[];
}

/** Win/loss record against a single opponent. */
export interface PlayerStats {
  opponent_nickname: string;
  games_played: number;
  games_won: number;
  games_lost: number;
  total_points_won: number;
  total_points_lost: number;
}

/** Aggregate statistics for a player across all games. */
export interface StatsOverview {
  total_games: number;
  total_wins: number;
  total_losses: number;
  win_rate: number;
  per_opponent: PlayerStats[];
}

/** A single game entry in the player's game history. */
export interface GameHistoryItem {
  table_id: string;
  opponent_nickname: string;
  player_color: "white" | "black";
  result: "win" | "loss" | "abandoned";
  win_type: string | null;
  score: number | null;
  played_at: string;
  table_status: string;
}

/** Dashboard data with game history and summary stats. */
export interface DashboardData {
  total_games: number;
  wins: number;
  losses: number;
  win_rate: number;
  abandoned_games: number;
  games: GameHistoryItem[];
  rating: number;
  rating_games: number;
  tier?: string;
  challenge_points?: number;
  active_season?: Season | null;
}

/** Win/loss split for a subset of games (e.g. as white, blitz time control). */
export interface ColorWinRate {
  games: number;
  wins: number;
  win_rate: number;
}

/** Cube action counters and derived accept rate. */
export interface CubeStats {
  offered: number;
  accepted: number;
  declined: number;
  accept_rate: number;
}

/** One data point on the player's ELO rating graph. */
export interface RatingHistoryPoint {
  played_at: string;
  rating_after: number;
  rating_change: number;
}

/** Full advanced-stats payload surfaced in the Dashboard Stats tab. */
export interface AdvancedStatsData {
  total_games: number;
  gammon_wins: number;
  gammon_losses: number;
  gammon_rate: number;
  backgammon_wins: number;
  backgammon_losses: number;
  backgammon_rate: number;
  win_rate_as_white: ColorWinRate;
  win_rate_as_black: ColorWinRate;
  win_rate_by_time_control: Record<string, ColorWinRate>;
  cube_stats: CubeStats;
  rating_history: RatingHistoryPoint[];
}

/** A single entry in the leaderboard. */
export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  nickname: string;
  rating: number;
  rating_games: number;
  total_wins: number;
  total_games: number;
  win_rate: number;
  tier?: string;
}

/** Response from the leaderboard endpoint. */
export interface LeaderboardData {
  entries: LeaderboardEntry[];
  total: number;
  /**
   * Viewer's row when they are ranked but fall outside the returned pagination
   * window. Enables the "you are #N" sticky footer.
   */
  viewer_entry?: LeaderboardEntry | null;
}

/** Time-period filter for the leaderboard. */
export type LeaderboardPeriod = "all_time" | "month" | "week";

// ---------------------------------------------------------------------------
// Tournament types
// ---------------------------------------------------------------------------

/** Status of a tournament. */
export type TournamentStatus = "registering" | "in_progress" | "completed";

/** A tournament. */
export interface Tournament {
  id: string;
  name: string;
  max_players: number;
  match_points: number;
  status: TournamentStatus;
  created_by: string | null;
  created_at: string;
  winner_id: string | null;
  winner_nickname: string | null;
  player_count: number;
}

/** A player's entry in a tournament. */
export interface TournamentEntry {
  id: number;
  player_id: string | null;
  player_nickname: string;
  seed: number;
  eliminated: boolean;
}

/** A single match in a tournament bracket. */
export interface TournamentMatch {
  id: number;
  round_number: number;
  match_number: number;
  player1_id: string | null;
  player1_nickname: string | null;
  player2_id: string | null;
  player2_nickname: string | null;
  table_id: string | null;
  winner_id: string | null;
  status: "pending" | "playing" | "completed" | "bye";
}

/** Full tournament bracket data. */
export interface TournamentBracket {
  tournament: Tournament;
  entries: TournamentEntry[];
  matches: TournamentMatch[];
  total_rounds: number;
}

/** A chat message exchanged between players. */
export interface ChatMessage {
  player_id: string;
  nickname: string;
  message: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// WebSocket message types
// ---------------------------------------------------------------------------

/** A suggested move from the hint system. */
export interface HintMove {
  from: number;
  to: number;
  equity: number;
}

/** Discriminator values for WebSocket messages. */
export type WSMessageType =
  | "game_state"
  | "player_joined"
  | "dice_rolled"
  | "move_made"
  | "turn_ended"
  | "game_over"
  | "waiting"
  | "error"
  | "opponent_disconnected"
  | "opponent_reconnected"
  | "hint"
  | "chat_message";

/** Sent when the full game state needs to be (re)synchronised. */
export interface WSGameStateMessage {
  type: "game_state";
  data: {
    game_state: GameState;
    your_color: Color;
    table: Table;
  };
}

/** Sent when a server-side error occurs. */
export interface WSErrorMessage {
  type: "error";
  data: {
    message: string;
  };
}

/** Sent when a hint response arrives from the server. */
export interface WSHintMessage {
  type: "hint";
  data: {
    suggested_moves: HintMove[];
    hints_remaining: number;
  };
}

/** Sent when a chat message arrives from another player. */
export interface WSChatMessage {
  type: "chat_message";
  data: ChatMessage;
}

/** Sent for simple signal messages with no meaningful payload. */
export interface WSSignalMessage {
  type: "player_joined" | "dice_rolled" | "move_made" | "turn_ended" | "game_over" | "waiting" | "opponent_disconnected" | "opponent_reconnected";
  data: Record<string, unknown>;
}

/** Discriminated union of all WebSocket messages. */
export type WSMessage = WSGameStateMessage | WSErrorMessage | WSHintMessage | WSChatMessage | WSSignalMessage;
