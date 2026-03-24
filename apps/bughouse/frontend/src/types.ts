// ---- Piece & Board types ----

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q';

export type PocketPieces = Record<PieceType, number>;

export interface BoardState {
  fen: string;
  last_move: { from: string; to: string } | null;
}

// ---- Game state from server ----

export type GameStatus = 'waiting' | 'playing' | 'finished';
export type TeamWinner = 'a' | 'b' | null;
export type PieceColor = 'white' | 'black';

export interface Pockets {
  board_a_white: PocketPieces;
  board_a_black: PocketPieces;
  board_b_white: PocketPieces;
  board_b_black: PocketPieces;
}

export interface GameOver {
  winner: TeamWinner;
  reason: string;
}

export interface GameState {
  type: 'game_state';
  boards: [BoardState, BoardState];
  pockets: Pockets;
  players: Record<string, string | null>;
  status: GameStatus;
  turn: [PieceColor, PieceColor];
  game_over: GameOver | null;
  legal_moves: string[];
  legal_drops: string[];
}

// ---- Server messages ----

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface GameOverMessage {
  type: 'game_over';
  winner: TeamWinner;
  reason: string;
}

export interface PlayerJoinedMessage {
  type: 'player_joined';
  seat: number;
  player_name: string;
}

export interface PlayerLeftMessage {
  type: 'player_left';
  seat: number;
  player_name: string;
}

export type ServerMessage =
  | GameState
  | ErrorMessage
  | GameOverMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage;

// ---- Client messages ----

export interface MoveMessage {
  type: 'move';
  board: number;
  from: string;
  to: string;
  promotion: string | null;
}

export interface DropMessage {
  type: 'drop';
  board: number;
  piece: string;
  square: string;
}

export interface ResignMessage {
  type: 'resign';
}

export type ClientMessage = MoveMessage | DropMessage | ResignMessage;

// ---- API types ----

export interface CreateGameResponse {
  game_id: string;
  player_token: string;
  seat: number;
}

export interface JoinGameResponse {
  player_token: string;
  seat: number;
}

export interface WatchGameResponse {
  spectator_token: string;
}

export interface GameListItem {
  game_id: string;
  players: Record<string, string | null>;
  status: GameStatus;
  created_at: string;
}

// ---- Seat helpers ----

// Seats: 0=Board A White (Team A), 1=Board A Black (Team B),
//        2=Board B White (Team B), 3=Board B Black (Team A)
// Partners: 0<->3, 1<->2

export function seatBoard(seat: number): number {
  return seat <= 1 ? 0 : 1;
}

export function seatColor(seat: number): PieceColor {
  return seat % 2 === 0 ? 'white' : 'black';
}

export function seatTeam(seat: number): 'a' | 'b' {
  return seat === 0 || seat === 3 ? 'a' : 'b';
}

export function partnerSeat(seat: number): number {
  const partners: Record<number, number> = { 0: 3, 1: 2, 2: 1, 3: 0 };
  return partners[seat];
}

// Map seat to the pocket key for their pieces-in-hand
export function seatPocketKey(seat: number): keyof Pockets {
  const map: Record<number, keyof Pockets> = {
    0: 'board_a_white',
    1: 'board_a_black',
    2: 'board_b_white',
    3: 'board_b_black',
  };
  return map[seat];
}
