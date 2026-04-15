/**
 * Pure reducer for the in-game UI state (bidding → passing → meld → tricks →
 * hand-complete → game-over). Shared by web and mobile so there is exactly one
 * source of truth for how WsEvents mutate client state.
 *
 * Side effects (timers, navigation) are NOT handled here — the caller performs
 * them and dispatches the corresponding action (e.g. CLEAR_TRICK_DISPLAY,
 * CLEAR_ERROR) when they fire.
 */
import type {
  Phase,
  BiddingState,
  BiddingResult,
  MeldData,
  CardPlayed,
  TrickResult,
  HandResultData,
  PassingState,
  WsEvent,
} from "./types";

export interface GameState {
  phase: Phase;
  hand: string[];
  biddingState: BiddingState;
  biddingResult: BiddingResult | null;
  trumpSuit: string | null;
  meldData: MeldData | null;
  acknowledgedSeats: string[];
  error: string | null;

  trickNumber: number;
  currentTrick: CardPlayed[];
  nextToActSeat: string | null;
  legalCards: string[];
  tricksTaken: Record<string, number>;
  trickScores: Record<string, number>;
  trickResult: TrickResult | null;

  handResult: HandResultData | null;
  handResultAckedSeats: string[];
  passingState: PassingState | null;
  gameScores: Record<string, number>;

  gameOver: {
    winner_team: string;
    final_scores: Record<string, number>;
    forfeit_note?: string;
  } | null;
  rematchRequested: boolean;
  pendingRematchSeats: string[];

  /**
   * Snapshot of `hand` taken when the user sends PLAY_CARD optimistically.
   * Kept in state (not a ref) so ERROR rollback is a pure reducer transition.
   * Cleared on the server's CARD_PLAYED confirmation for our seat, or on
   * ERROR rollback.
   */
  pendingPlay: { card: string; handSnapshot: string[] } | null;
}

export function initialGameState(initialHand: string[]): GameState {
  return {
    phase: "BIDDING",
    hand: initialHand,
    biddingState: {
      current_highest_bid: null,
      highest_bidder_seat: null,
      next_to_act_seat: "",
      minimum_valid_bid: 25,
    },
    biddingResult: null,
    trumpSuit: null,
    meldData: null,
    acknowledgedSeats: [],
    error: null,
    trickNumber: 1,
    currentTrick: [],
    nextToActSeat: null,
    legalCards: [],
    tricksTaken: { NS: 0, EW: 0 },
    trickScores: { NS: 0, EW: 0 },
    trickResult: null,
    handResult: null,
    handResultAckedSeats: [],
    passingState: null,
    gameScores: { NS: 0, EW: 0 },
    gameOver: null,
    rematchRequested: false,
    pendingRematchSeats: [],
    pendingPlay: null,
  };
}

export type GameAction =
  /** A WsEvent arrived from the server. */
  | { type: "WS_EVENT"; event: WsEvent; mySeat: string }
  /** User clicked a card — optimistic snapshot + disable legal cards. */
  | { type: "OPTIMISTIC_PLAY"; card: string }
  /** User pressed the rematch button — mark requested locally. */
  | { type: "REQUEST_REMATCH" }
  /** 2-second trick-review timer fired. */
  | { type: "CLEAR_TRICK_DISPLAY"; nextTrickNumber: number }
  /** 5-second error auto-dismiss timer fired. */
  | { type: "CLEAR_ERROR" };

function resetPerHand(s: GameState): GameState {
  return {
    ...s,
    handResult: null,
    handResultAckedSeats: [],
    biddingResult: null,
    trumpSuit: null,
    meldData: null,
    acknowledgedSeats: [],
    trickNumber: 1,
    currentTrick: [],
    trickResult: null,
    tricksTaken: { NS: 0, EW: 0 },
    trickScores: { NS: 0, EW: 0 },
    nextToActSeat: null,
    legalCards: [],
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "OPTIMISTIC_PLAY":
      return {
        ...state,
        pendingPlay: { card: action.card, handSnapshot: state.hand },
        legalCards: [],
      };
    case "REQUEST_REMATCH":
      return { ...state, rematchRequested: true };
    case "CLEAR_TRICK_DISPLAY":
      return {
        ...state,
        trickResult: null,
        currentTrick: [],
        trickNumber: action.nextTrickNumber,
      };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    case "WS_EVENT":
      return applyEvent(state, action.event, action.mySeat);
  }
}

function applyEvent(state: GameState, evt: WsEvent, mySeat: string): GameState {
  switch (evt.event) {
    case "ERROR": {
      const p = evt.payload;
      // Idempotent: server tells us we already voted — ignore quietly.
      if (p.code === "ALREADY_REQUESTED_REMATCH") return state;
      // If a card play was pending, roll hand back to the pre-send snapshot.
      const rolled = state.pendingPlay
        ? { ...state, hand: state.pendingPlay.handSnapshot, legalCards: [], pendingPlay: null }
        : state;
      const rematchReset =
        p.code === "REMATCH_NOT_AVAILABLE"
          ? { ...rolled, rematchRequested: false }
          : rolled;
      return { ...rematchReset, error: p.message };
    }

    case "HAND_DEALT":
      return { ...resetPerHand(state), hand: evt.payload.cards, error: null };

    case "BIDDING_TURN":
      return {
        ...state,
        error: null,
        biddingState: evt.payload,
        phase: "BIDDING",
      };

    case "BIDDING_COMPLETED":
      return {
        ...state,
        error: null,
        biddingResult: evt.payload,
        phase: "NAMING_TRUMP",
      };

    case "TRUMP_NAMED":
      return { ...state, error: null, trumpSuit: evt.payload.trump_suit };

    case "PASSING_PHASE_STARTED": {
      const p = evt.payload;
      return {
        ...state,
        error: null,
        passingState: {
          trump_suit: p.trump_suit,
          bidding_team: p.bidding_team,
          bidder_seat: p.bidder_seat,
          partner_seat: p.partner_seat,
          submitted_seats: [],
        },
        phase: "PASSING_CARDS",
      };
    }

    case "CARDS_PASSED":
      return {
        ...state,
        error: null,
        passingState: state.passingState
          ? { ...state.passingState, submitted_seats: evt.payload.submitted_seats }
          : state.passingState,
      };

    case "CARDS_RECEIVED":
      return { ...state, error: null, hand: evt.payload.new_hand };

    case "MELD_BROADCAST": {
      const p = evt.payload;
      return {
        ...state,
        error: null,
        trumpSuit: p.trump_suit,
        meldData: {
          trump_suit: p.trump_suit,
          winning_bid: p.winning_bid,
          is_shoot_the_moon: p.is_shoot_the_moon,
          bidding_team: p.bidding_team,
          team_meld: p.team_meld,
          player_melds: p.player_melds,
        },
        acknowledgedSeats: [],
        phase: "SHOWING_MELD",
      };
    }

    case "MELD_ACKNOWLEDGED":
      return {
        ...state,
        error: null,
        acknowledgedSeats: evt.payload.acknowledged_seats,
      };

    case "MELD_PHASE_COMPLETED":
      return {
        ...state,
        error: null,
        phase: "TRICK_PLAYING",
        trickNumber: 1,
        currentTrick: [],
        tricksTaken: { NS: 0, EW: 0 },
        trickScores: { NS: 0, EW: 0 },
        trickResult: null,
        legalCards: [],
        nextToActSeat: null,
        handResult: null,
      };

    case "TRICK_STATE": {
      const p = evt.payload;
      return {
        ...state,
        error: null,
        trickNumber: p.trick_number,
        tricksTaken: p.tricks_taken,
        trickScores: p.trick_scores,
      };
    }

    case "YOUR_TURN": {
      const p = evt.payload;
      return {
        ...state,
        error: null,
        trickResult: null,
        trickNumber: p.trick_number,
        currentTrick: p.cards_played,
        nextToActSeat: p.seat,
        legalCards: p.legal_cards,
      };
    }

    case "CARD_PLAYED": {
      const p = evt.payload;
      // Server confirmed our play — remove the card from hand, clear pending.
      let hand = state.hand;
      let pendingPlay = state.pendingPlay;
      if (p.seat === mySeat && pendingPlay) {
        const { card, handSnapshot } = pendingPlay;
        const idx = handSnapshot.indexOf(card);
        hand = idx === -1
          ? handSnapshot
          : [...handSnapshot.slice(0, idx), ...handSnapshot.slice(idx + 1)];
        pendingPlay = null;
      }
      // If a completed trick is still on the table, this card starts a new trick.
      const currentTrick = state.trickResult
        ? [{ seat: p.seat, card: p.card }]
        : [...state.currentTrick, { seat: p.seat, card: p.card }];
      return {
        ...state,
        error: null,
        hand,
        pendingPlay,
        trickResult: null,
        currentTrick,
        nextToActSeat: p.next_to_act_seat,
        legalCards: [],
      };
    }

    case "TRICK_COMPLETED": {
      const p = evt.payload;
      return {
        ...state,
        error: null,
        trickResult: {
          trick_number: p.trick_number,
          winner_seat: p.winner_seat,
          trick_points: p.trick_points,
          cards_played: state.currentTrick,
          tricks_taken: p.tricks_taken,
          trick_scores: p.trick_scores,
        },
        tricksTaken: p.tricks_taken,
        trickScores: p.trick_scores,
      };
    }

    case "HAND_COMPLETED": {
      const p = evt.payload;
      return {
        ...state,
        error: null,
        handResult: {
          trick_scores: p.trick_scores,
          team_meld: p.team_meld,
          bid: p.bid,
          bidding_team: p.bidding_team,
          score_deltas: p.score_deltas,
          game_scores: p.game_scores,
        },
        gameScores: p.game_scores,
        handResultAckedSeats: [],
        phase: "HAND_COMPLETE",
      };
    }

    case "HAND_RESULT_ACKNOWLEDGED":
      return {
        ...state,
        error: null,
        handResultAckedSeats: evt.payload.acknowledged_seats,
      };

    case "GAME_OVER": {
      const p = evt.payload;
      return {
        ...state,
        error: null,
        gameOver: { winner_team: p.winner_team, final_scores: p.final_scores },
        gameScores: p.final_scores,
        rematchRequested: false,
        pendingRematchSeats: [],
        phase: "GAME_OVER",
      };
    }

    case "GAME_FORFEITED": {
      const p = evt.payload;
      return {
        ...state,
        error: null,
        gameOver: {
          winner_team: p.winning_team,
          final_scores: p.final_scores,
          forfeit_note: `${p.forfeiting_team} forfeited the game`,
        },
        gameScores: p.final_scores,
        rematchRequested: false,
        pendingRematchSeats: [],
        phase: "GAME_OVER",
      };
    }

    case "REMATCH_REQUESTED": {
      const p = evt.payload;
      return {
        ...state,
        error: null,
        pendingRematchSeats: p.pending_seats,
        rematchRequested: p.seat === mySeat ? true : state.rematchRequested,
      };
    }

    case "REMATCH_STARTED":
      // Fresh HAND_DEALT + BIDDING_TURN follow immediately — start clean.
      return initialGameState([]);

    // Handled by the caller (navigates away).
    case "LEFT_TO_LOBBY":
      return state;

    // Handled by lobby/room, ignored in-game.
    case "LOBBY_STATE_UPDATED":
    case "SEAT_CLAIM_FAILED":
      return state;
  }
}
