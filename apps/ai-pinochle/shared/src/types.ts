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
  | "HAND_RESULT_ACKNOWLEDGED" | "GAME_OVER"
  | "REMATCH_REQUESTED" | "REMATCH_STARTED"
  | "GAME_FORFEITED" | "LEFT_TO_LOBBY"
  | "ACHIEVEMENTS_UNLOCKED";

export type ClientAction =
  | "SELECT_SEAT" | "START_GAME" | "SUBMIT_BID" | "DECLARE_TRUMP"
  | "PASS_CARDS" | "ACKNOWLEDGE_MELD" | "PLAY_CARD" | "ACKNOWLEDGE_HAND_RESULT"
  | "REMATCH_REQUEST" | "LEAVE_TO_LOBBY"
  | "SWAP_SEAT_REQUEST" | "SWAP_SEAT_ACCEPT" | "KICK_PLAYER" | "FILL_AI";

/**
 * Stable, machine-readable error codes returned in `ERROR` event payloads.
 * Mirrors `server/app/websocket/errors.py::ErrorCode`. Clients should branch
 * on `code` rather than substring-matching `message`.
 */
export type ErrorCode =
  | "UNKNOWN_ACTION" | "INVALID_JSON" | "SERVER_ERROR"
  | "GAME_NOT_FOUND" | "NOT_SEATED" | "STATE_CONFLICT"
  | "WRONG_PHASE" | "GAME_ALREADY_STARTED"
  | "INVALID_SEAT"
  | "NOT_GAME_CREATOR" | "SEATS_NOT_FULL"
  | "NOT_YOUR_TURN" | "INVALID_BID" | "BID_TOO_LOW" | "BID_TOO_HIGH" | "DEALER_MUST_BID"
  | "NOT_BID_WINNER" | "INVALID_SUIT"
  | "NOT_BIDDING_TEAM" | "ALREADY_PASSED" | "INVALID_PASS_CARDS" | "CARD_NOT_IN_HAND"
  | "ALREADY_ACKNOWLEDGED"
  | "INVALID_CARD" | "ILLEGAL_PLAY"
  | "REMATCH_NOT_AVAILABLE" | "ALREADY_REQUESTED_REMATCH"
  | "NO_PENDING_SWAP" | "SWAP_NOT_FOR_YOU" | "CANNOT_KICK_SELF";

export interface WsErrorPayload {
  code: ErrorCode;
  message: string;
}

/**
 * Rematch event payload contracts (back-end ↔ front-end):
 *
 *   Action  REMATCH_REQUEST    payload: {}                             (no body)
 *   Event   REMATCH_REQUESTED  payload: { seat, pending_seats: string[] }
 *   Event   REMATCH_STARTED    payload: { dealer_seat, first_bidder_seat }
 *                              followed by HAND_DEALT (private) + BIDDING_TURN (broadcast)
 *
 *   Action  LEAVE_TO_LOBBY     payload: {}
 *   Event   LEFT_TO_LOBBY      payload: {}    (sent only to the leaving WS, then close)
 *
 *   Event   GAME_FORFEITED     payload: {
 *     winning_team:    "NS" | "EW",
 *     forfeiting_team: "NS" | "EW",
 *     forfeiting_seat: string,
 *     final_scores:    { NS: number, EW: number }
 *   }
 */
export interface RematchRequestedPayload {
  seat: string;
  pending_seats: string[];
}

export interface RematchStartedPayload {
  dealer_seat: string;
  first_bidder_seat: string;
}

export interface GameForfeitedPayload {
  winning_team: "NS" | "EW";
  forfeiting_team: "NS" | "EW";
  forfeiting_seat: string;
  final_scores: Record<"NS" | "EW", number>;
}

/**
 * WsEvent is a discriminated union defined in `schemas.ts` (via `z.infer`) so
 * the Zod schema and the TS type cannot drift. Re-export here so existing
 * imports from `@pinochle/shared` keep working.
 */
export type { WsEvent, PayloadFor, WsAction } from "./schemas";

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

export interface ReplayBid {
  seat: string;
  bid_amount: number | null;
  is_shoot_the_moon: boolean;
}

export interface ReplayTrick {
  trick_number: number;
  led_by_seat: string | null;
  won_by_seat: string | null;
  cards: Record<string, string | null>;
  trick_points: number | null;
}

export interface ReplayHand {
  hand_number: number;
  winning_bidder_seat: string | null;
  winning_bid_amount: number | null;
  is_shoot_the_moon: boolean;
  trump_suit: string | null;
  ns_meld_score: number | null;
  ew_meld_score: number | null;
  ns_trick_score: number | null;
  ew_trick_score: number | null;
  is_set: boolean | null;
  bids: ReplayBid[];
  tricks: ReplayTrick[];
}

export interface ReplayResponse {
  room_code: string;
  status: string;
  final_scores: { ns: number; ew: number };
  players: Record<string, string | null>;
  hands: ReplayHand[];
}
