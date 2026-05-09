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

/** Bot difficulty levels. `gnu` routes to the GNU Backgammon engine. */
export type BotDifficulty = "easy" | "medium" | "hard" | "expert" | "gnu";

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
  resign_offered: boolean;
  resign_offered_by: Color | null;
  resign_type: WinType | null;
  pip_white?: number;
  pip_black?: number;
  time_control?: string;
  white_time_remaining_ms?: number | null;
  black_time_remaining_ms?: number | null;
  /** Notation of the most recently completed turn's moves (e.g. "13/11 6/5"). */
  last_turn_notation?: string | null;
  /** Colour of the player who made the most recently completed turn. */
  last_turn_color?: Color | null;
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

/** A single entry in a player's per-season history. */
export interface PlayerSeasonHistoryEntry {
  season_id: number;
  season_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  end_rating: number;
  peak_rating: number;
  wins: number;
  losses: number;
  gammons_won: number;
  gammons_lost: number;
  tier_final: string;
  games_played: number;
  updated_at: string;
}

/** A single row in the move-history log for a completed turn. */
export interface MoveRecord {
  move_number: number;
  player_id: string | null;
  dice_roll: string;
  moves_notation: string;
  bot_strategy: string | null;
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
  white_player_id?: string | null;
  black_player_id?: string | null;
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

/**
 * Quality classification for a single move.
 *
 * The backend may return either the ML-native labels (`best`, `good`,
 * `inaccuracy`, `mistake`, `blunder`) or the GNU Backgammon native labels
 * (`very_good`, `good`, `doubtful`, `bad`, `very_bad`, `blunder`). The UI
 * handles both sets interchangeably.
 */
export type MoveQuality =
  | "best"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "very_good"
  | "doubtful"
  | "bad"
  | "very_bad";

/** Per-move win-probability breakdown returned by the analysis service. */
export interface MoveProbs {
  /** P(current player wins the game). */
  win: number;
  /** P(current player wins a gammon). */
  win_g: number;
  /** P(current player loses a gammon). */
  lose_g: number;
  /** P(current player wins a backgammon). */
  win_bg: number;
  /** P(current player loses a backgammon). */
  lose_bg: number;
}

/** A ranked candidate move from the analysis engine. */
export interface MoveCandidate {
  rank: number;
  notation: string;
  equity: number;
  equity_diff: number;  // relative to rank #1, always <= 0
  probs?: MoveProbs | null;
}

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
  /** Full probability distribution for what the engine would have played. */
  best_probs?: MoveProbs | null;
  /** Full probability distribution for the move the player actually made. */
  chosen_probs?: MoveProbs | null;
  /** Convenience scalar for the engine's top move's win probability. */
  best_win_prob?: number | null;
  /** Convenience scalar for the chosen move's win probability. */
  chosen_win_prob?: number | null;
  /** Which evaluator produced this row — drives the "Analyzed by…" banner. */
  source?: "gnubg" | "ml" | "heuristic" | null;
  /** Top candidate moves ranked by equity (up to 5). */
  top_moves?: MoveCandidate[] | null;
}

/** Full analysis payload for a completed game. */
export interface AnalysisData {
  table_id: string;
  ml_available: boolean;
  moves_analysed: number;
  total_moves: number;
  move_analyses: MoveAnalysis[];
  analysis_source?: string | null;  // e.g. "GNU Backgammon (2-ply)", "ML neural network (0-ply)"
  analysis_ply?: number | null;     // ply depth used, or null if not gnubg
  status?: "complete" | "running" | "failed";  // background analysis state
  progress?: number | null;                     // 0.0-1.0 when running
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

/** Cube action counters and ML-derived decision accuracy. */
export interface CubeStats {
  offered: number;
  accepted: number;
  declined: number;
  accept_rate: number;
  /** Percent of scored cube actions that match the ML-optimal decision. */
  accuracy: number | null;
  /** Count of cube actions by verdict class. */
  by_verdict: {
    best: number;
    borderline: number;
    mistake: number;
    blunder: number;
  };
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

// ---------------------------------------------------------------------------
// Analysis Mode types
// ---------------------------------------------------------------------------

export interface AnalysisConfig {
  game_type: "money" | "match";
  match_length?: number;
  player_color: "white" | "black" | "random";
  gnubg_ply: 0 | 1 | 2 | 3;
  auto_analysis: "off" | "per_move" | "per_turn";
}

export interface AnalysisSessionData {
  id: string;
  player_id: string;
  game_type: string;
  match_length: number | null;
  player_color: string;
  gnubg_ply: number;
  auto_analysis: string;
  status: string;
  result: string | null;
  loaded_from: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface AnalysisGameState {
  session: AnalysisSessionData;
  game_state: GameState;
  move_count: number;
  current_view_index: number;
}

export interface AnalysisMoveRecord {
  move_number: number;
  player: string;
  dice_roll: string;
  move_notation: string;
  quality: MoveQuality | null;
  equity_loss: number | null;
  annotation: string | null;
}

export interface AnalysisHintCandidate {
  rank: number;
  notation: string;
  moves: Move[];
  equity: number;
  equity_diff: number;
  probs: MoveProbs | null;
}

export interface AnalysisCubeAction {
  recommendation: string;
  equity_no_double: number;
  equity_double_take: number;
  equity_double_drop: number;
}

export interface AnalysisHintResult {
  cube_action: AnalysisCubeAction | null;
  candidates: AnalysisHintCandidate[];
}

export interface AnalysisEvalResult {
  equity: number;
  probs: MoveProbs;
  position_class?: string;
}

export interface AnalysisSettings {
  gnubg_ply: number;
  auto_analysis: string;
}

export type AnalysisPanelTab = "moves" | "analysis" | "settings";

/** Cube action analysis for a position. */
export interface CubeDecision {
  action: string;
  equity_no_double?: number | null;
  equity_double_take?: number | null;
  equity_double_drop?: number | null;
}

/** Full deep-dive analysis for a single position at maximum depth. */
export interface DeepDiveResult {
  table_id: string;
  move_number: number;
  player_color: "white" | "black";
  dice_roll: string;
  moves_notation: string;
  win_prob?: number | null;
  win_g_prob?: number | null;
  win_bg_prob?: number | null;
  lose_prob?: number | null;
  lose_g_prob?: number | null;
  lose_bg_prob?: number | null;
  cubeless_equity?: number | null;
  cubeful_equity?: number | null;
  top_moves: MoveCandidate[];
  cube_decision?: CubeDecision | null;
  source: string;
  ply: number;
  position_id?: string | null;
  analysis_time_ms?: number | null;
}
