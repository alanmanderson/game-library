/**
 * TypeScript type definitions for the multiplayer backgammon game.
 *
 * These types mirror the backend (FastAPI) models and WebSocket message
 * schemas so that the frontend can work with strongly-typed data throughout.
 */

/** Checker / player color. */
export type Color = "white" | "black";

/** High-level phase the game is currently in. */
export type GameStatus = "waiting" | "rolling" | "moving" | "finished";

/** How a game was won – affects point scoring in match play. */
export type WinType = "normal" | "gammon" | "backgammon";

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
}

/** A single row in the move-history log for a completed turn. */
export interface MoveRecord {
  move_number: number;
  dice_roll: string;
  moves_notation: string;
  created_at: string;
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
}

/** Dashboard data with game history and summary stats. */
export interface DashboardData {
  total_games: number;
  wins: number;
  losses: number;
  win_rate: number;
  abandoned_games: number;
  games: GameHistoryItem[];
}

// ---------------------------------------------------------------------------
// WebSocket message types
// ---------------------------------------------------------------------------

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
  | "opponent_reconnected";

/** Generic WebSocket message (use the narrower types below when possible). */
export interface WSMessage {
  type: WSMessageType;
  data: any;
}

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
