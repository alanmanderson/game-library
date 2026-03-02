export interface User {
  id: string;
  username: string;
  email: string | null;
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

export interface WsEvent {
  event: string;
  payload: Record<string, unknown>;
}

export interface UseWebSocketResult {
  sendMessage: (msg: Record<string, unknown>) => void;
  lastEvent: WsEvent | null;
  connected: boolean;
}

export type Phase =
  | "BIDDING"
  | "NAMING_TRUMP"
  | "PASSING_CARDS"
  | "SHOWING_MELD"
  | "TRICK_PLAYING"
  | "HAND_COMPLETE";

export interface BiddingState {
  currentBid: number | null;
  highestBidderSeat: string | null;
  nextSeat: string;
  minBid: number;
}

export interface BiddingResult {
  winningSeat: string;
  winningBid: number;
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
  trumpSuit: string;
  winningBid: number;
  biddingTeam: string;
  teamMeld: Record<string, number>;
  playerMelds: Record<string, PlayerMeld>;
}

export interface CardPlayed {
  seat: string;
  card: string;
}

export interface TrickResult {
  trickNumber: number;
  winnerSeat: string;
  trickPoints: number;
}

export interface HandResultData {
  trickScores: Record<string, number>;
  teamMeld: Record<string, number>;
  bid: number;
  biddingTeam: string;
  scoreDeltas: Record<string, number>;
  gameScores: Record<string, number>;
}

export interface PassingState {
  trumpSuit: string;
  biddingTeam: string;
  bidderSeat: string;
  partnerSeat: string;
  submittedSeats: string[];
}

export type Seats = Record<string, string | null>;

export interface AuthResponse {
  id: string;
  username: string;
  email: string | null;
  access_token: string;
  token_type: string;
}

export interface FieldErrors {
  password?: string;
  email?: string;
}

export interface CreateResponse {
  room_code: string;
}

export interface JoinResponse {
  room_code: string;
  seats: Record<string, string | null>;
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
