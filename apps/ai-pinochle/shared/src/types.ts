export interface User {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

export type ServerEvent =
  | "ERROR" | "LOBBY_STATE_UPDATED" | "SEAT_CLAIM_FAILED"
  | "HAND_DEALT" | "BIDDING_TURN" | "BIDDING_COMPLETED"
  | "TRUMP_NAMED" | "PASSING_PHASE_STARTED" | "CARDS_PASSED"
  | "CARDS_RECEIVED" | "MELD_BROADCAST" | "MELD_ACKNOWLEDGED"
  | "MELD_PHASE_COMPLETED" | "YOUR_TURN" | "CARD_PLAYED"
  | "TRICK_COMPLETED" | "TRICK_STATE" | "HAND_COMPLETED"
  | "HAND_RESULT_ACKNOWLEDGED" | "GAME_OVER";

export type ClientAction =
  | "SELECT_SEAT" | "START_GAME" | "SUBMIT_BID" | "DECLARE_TRUMP"
  | "PASS_CARDS" | "ACKNOWLEDGE_MELD" | "PLAY_CARD" | "ACKNOWLEDGE_HAND_RESULT";

export interface WsEvent {
  event: ServerEvent;
  payload: Record<string, unknown>;
}

export interface UseWebSocketResult {
  sendMessage: (msg: Record<string, unknown>) => boolean;
  lastEvent: WsEvent | null;
  connected: boolean;
}

export type Phase =
  | "LOBBY_WAITING"
  | "BIDDING"
  | "NAMING_TRUMP"
  | "PASSING_CARDS"
  | "SHOWING_MELD"
  | "TRICK_PLAYING"
  | "HAND_COMPLETE"
  | "GAME_OVER";

export interface BiddingState {
  current_highest_bid: number | null;
  highest_bidder_seat: string | null;
  next_to_act_seat: string;
  minimum_valid_bid: number;
}

export interface BiddingResult {
  winning_seat: string;
  winning_bid: number;
  is_shoot_the_moon: boolean;
}

export interface Meld {
  name: string;
  cards: string[];
  points: number;
}

export interface PlayerMeld {
  melds: Meld[];
  total: number;
}

export interface MeldData {
  trump_suit: string;
  winning_bid: number;
  is_shoot_the_moon: boolean;
  bidding_team: string;
  team_meld: Record<string, number>;
  player_melds: Record<string, PlayerMeld>;
}

export interface CardPlayed {
  seat: string;
  card: string;
}

export interface TrickResult {
  trick_number: number;
  winner_seat: string;
  trick_points: number;
  cards_played: CardPlayed[];
  tricks_taken: Record<string, number>;
  trick_scores: Record<string, number>;
}

export interface HandResultData {
  trick_scores: Record<string, number>;
  team_meld: Record<string, number>;
  bid: number;
  bidding_team: string;
  score_deltas: Record<string, number>;
  game_scores: Record<string, number>;
}

export interface PassingState {
  trump_suit: string;
  bidding_team: string;
  bidder_seat: string;
  partner_seat: string;
  submitted_seats: string[];
}

export type Seats = Record<string, string | null>;

export interface AuthResponse {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string | null;
  access_token: string;
  token_type: string;
}

export interface FieldErrors {
  first_name?: string;
  last_name?: string;
  password?: string;
  email?: string;
}

export interface CreateResponse {
  room_code: string;
}

export interface JoinResponse {
  room_code: string;
  seats: Record<string, string | null>;
  your_seat: string | null;
  game_id: string;
  phase: string;
}

export interface GameSummary {
  room_code: string;
  status: string;
  phase: string;
  ns_score: number;
  ew_score: number;
  players: Record<string, string | null>;
  started_at: string | null;
  ended_at: string | null;
}
