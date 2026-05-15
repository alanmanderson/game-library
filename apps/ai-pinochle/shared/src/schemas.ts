/**
 * Zod schemas for every WebSocket event/action the client can see or send.
 *
 * Single source of truth — the `WsEvent` and `WsAction` discriminated unions in
 * `types.ts` are derived from these via `z.infer`. Adding a new event means:
 *   1. Add a schema entry here.
 *   2. Handlers branch on `event.event` and get typed payloads for free.
 *
 * Philosophy: be strict about fields the UI actually reads, lenient about the
 * rest. We treat unknown optional fields as non-fatal (server may add new
 * fields without breaking old clients). Missing required fields → drop the
 * message and log.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const TeamCode = z.enum(["NS", "EW"]);
const TeamScores = z.object({
  NS: z.number(),
  EW: z.number(),
});
// Server uses seat strings ("NORTH", "SOUTH", "EAST", "WEST") — keep as string
// rather than enum so a server-side rename doesn't blow up validation.
const Seat = z.string();

const ErrorCodeSchema = z.enum([
  "UNKNOWN_ACTION", "INVALID_JSON", "SERVER_ERROR",
  "GAME_NOT_FOUND", "NOT_SEATED", "STATE_CONFLICT",
  "WRONG_PHASE", "GAME_ALREADY_STARTED",
  "INVALID_SEAT",
  "NOT_GAME_CREATOR", "SEATS_NOT_FULL",
  "NOT_YOUR_TURN", "INVALID_BID", "BID_TOO_LOW", "BID_TOO_HIGH", "DEALER_MUST_BID",
  "NOT_BID_WINNER", "INVALID_SUIT",
  "NOT_BIDDING_TEAM", "ALREADY_PASSED", "INVALID_PASS_CARDS", "CARD_NOT_IN_HAND",
  "ALREADY_ACKNOWLEDGED",
  "INVALID_CARD", "ILLEGAL_PLAY",
  "REMATCH_NOT_AVAILABLE", "ALREADY_REQUESTED_REMATCH",
  "NO_PENDING_SWAP", "SWAP_NOT_FOR_YOU", "CANNOT_KICK_SELF",
]);

const MeldSchema = z.object({
  name: z.string(),
  cards: z.array(z.string()),
  points: z.number(),
});

const PlayerMeldSchema = z.object({
  melds: z.array(MeldSchema),
  total: z.number(),
});

const CardPlayedSchema = z.object({
  seat: Seat,
  card: z.string(),
});

// ---------------------------------------------------------------------------
// Server → Client events
// ---------------------------------------------------------------------------

const ErrorEvent = z.object({
  event: z.literal("ERROR"),
  payload: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
  }),
});

const PendingSwapSchema = z.object({
  from_seat: z.string(),
  to_seat: z.string(),
  from_player: z.string(),
});

const LobbyStateUpdatedEvent = z.object({
  event: z.literal("LOBBY_STATE_UPDATED"),
  payload: z.object({
    seats: z.record(z.string(), z.string().nullable()),
    your_seat: z.string().nullable(),
    is_host: z.boolean().optional(),
    pending_swap: PendingSwapSchema.nullable().optional(),
    bot_seats: z.array(z.string()).optional(),
    hints_enabled: z.boolean().optional(),
  }),
});

const SeatClaimFailedEvent = z.object({
  event: z.literal("SEAT_CLAIM_FAILED"),
  payload: z.object({
    code: z.string().optional(),
    message: z.string(),
    requested_seat: z.string().optional(),
  }),
});

const HandDealtEvent = z.object({
  event: z.literal("HAND_DEALT"),
  payload: z.object({
    cards: z.array(z.string()),
  }),
});

const BiddingTurnEvent = z.object({
  event: z.literal("BIDDING_TURN"),
  payload: z.object({
    current_highest_bid: z.number().nullable(),
    highest_bidder_seat: Seat.nullable(),
    next_to_act_seat: Seat,
    minimum_valid_bid: z.number(),
    // Present on reconnect snapshots so the client can populate the cumulative
    // scoreboard without waiting for the next HAND_COMPLETED.
    game_scores: z.record(z.string(), z.number()).optional(),
  }),
});

const BiddingCompletedEvent = z.object({
  event: z.literal("BIDDING_COMPLETED"),
  payload: z.object({
    winning_seat: Seat,
    winning_bid: z.number(),
    is_shoot_the_moon: z.boolean(),
    game_scores: z.record(z.string(), z.number()).optional(),
  }),
});

const TrumpNamedEvent = z.object({
  event: z.literal("TRUMP_NAMED"),
  payload: z.object({
    trump_suit: z.string(),
    declared_by_seat: Seat.optional(),
    bidding_team: z.string().optional(),
    winning_bid: z.number().optional(),
    is_shoot_the_moon: z.boolean().optional(),
    game_scores: z.record(z.string(), z.number()).optional(),
  }),
});

const PassingPhaseStartedEvent = z.object({
  event: z.literal("PASSING_PHASE_STARTED"),
  payload: z.object({
    trump_suit: z.string(),
    bidding_team: z.string(),
    bidder_seat: Seat,
    partner_seat: Seat,
  }),
});

const CardsPassedEvent = z.object({
  event: z.literal("CARDS_PASSED"),
  payload: z.object({
    seat: Seat,
    submitted_seats: z.array(Seat),
  }),
});

const CardsReceivedEvent = z.object({
  event: z.literal("CARDS_RECEIVED"),
  payload: z.object({
    cards_received: z.array(z.string()),
    new_hand: z.array(z.string()),
  }),
});

const MeldBroadcastEvent = z.object({
  event: z.literal("MELD_BROADCAST"),
  payload: z.object({
    trump_suit: z.string(),
    winning_bid: z.number(),
    is_shoot_the_moon: z.boolean(),
    bidding_team: z.string(),
    team_meld: z.record(z.string(), z.number()),
    player_melds: z.record(z.string(), PlayerMeldSchema),
    // Reconnect-only: cumulative scores + who has already clicked through.
    game_scores: z.record(z.string(), z.number()).optional(),
    acknowledged_seats: z.array(Seat).optional(),
  }),
});

const MeldAcknowledgedEvent = z.object({
  event: z.literal("MELD_ACKNOWLEDGED"),
  payload: z.object({
    seat: Seat.optional(),
    acknowledged_seats: z.array(Seat),
  }),
});

const MeldPhaseCompletedEvent = z.object({
  event: z.literal("MELD_PHASE_COMPLETED"),
  payload: z.object({
    team_meld: z.record(z.string(), z.number()).optional(),
    first_to_act_seat: Seat.optional().nullable(),
    game_scores: z.record(z.string(), z.number()).optional(),
  }),
});

const YourTurnEvent = z.object({
  event: z.literal("YOUR_TURN"),
  payload: z.object({
    seat: Seat,
    legal_cards: z.array(z.string()),
    trick_number: z.number(),
    led_suit: z.string().nullable().optional(),
    cards_played: z.array(CardPlayedSchema),
    currently_winning: z.unknown().optional(),
  }),
});

const CardPlayedEvent = z.object({
  event: z.literal("CARD_PLAYED"),
  payload: z.object({
    seat: Seat,
    card: z.string(),
    next_to_act_seat: Seat.nullable(),
  }),
});

const TrickCompletedEvent = z.object({
  event: z.literal("TRICK_COMPLETED"),
  payload: z.object({
    trick_number: z.number(),
    winner_seat: Seat,
    trick_points: z.number(),
    cards_played: z.array(CardPlayedSchema),
    tricks_taken: z.record(z.string(), z.number()),
    trick_scores: z.record(z.string(), z.number()),
  }),
});

const TrickStateEvent = z.object({
  event: z.literal("TRICK_STATE"),
  payload: z.object({
    trick_number: z.number(),
    tricks_taken: z.record(z.string(), z.number()),
    trick_scores: z.record(z.string(), z.number()),
    led_seat: Seat.nullable().optional(),
    game_scores: z.record(z.string(), z.number()).optional(),
  }),
});

const HandCompletedEvent = z.object({
  event: z.literal("HAND_COMPLETED"),
  payload: z.object({
    trick_scores: z.record(z.string(), z.number()),
    team_meld: z.record(z.string(), z.number()),
    bid: z.number(),
    bidding_team: z.string(),
    score_deltas: z.record(z.string(), z.number()),
    game_scores: z.record(z.string(), z.number()),
    // Reconnect-only: who has already dismissed the hand-result screen.
    acknowledged_seats: z.array(Seat).optional(),
  }),
});

const HandResultAcknowledgedEvent = z.object({
  event: z.literal("HAND_RESULT_ACKNOWLEDGED"),
  payload: z.object({
    seat: Seat.optional(),
    acknowledged_seats: z.array(Seat),
  }),
});

const GameOverEvent = z.object({
  event: z.literal("GAME_OVER"),
  payload: z.object({
    winner_team: z.string(),
    final_scores: z.record(z.string(), z.number()),
    // Reconnect-only: rematch votes that have already arrived, so the client
    // can restore "Waiting on X" without waiting for the next REMATCH_REQUESTED.
    pending_rematch_seats: z.array(Seat).optional(),
  }),
});

const RematchRequestedEvent = z.object({
  event: z.literal("REMATCH_REQUESTED"),
  payload: z.object({
    seat: Seat,
    pending_seats: z.array(Seat),
  }),
});

const RematchStartedEvent = z.object({
  event: z.literal("REMATCH_STARTED"),
  payload: z.object({
    dealer_seat: Seat,
    first_bidder_seat: Seat,
  }),
});

const GameForfeitedEvent = z.object({
  event: z.literal("GAME_FORFEITED"),
  payload: z.object({
    winning_team: TeamCode,
    forfeiting_team: TeamCode,
    forfeiting_seat: Seat,
    final_scores: TeamScores,
  }),
});

const LeftToLobbyEvent = z.object({
  event: z.literal("LEFT_TO_LOBBY"),
  payload: z.object({}).loose(),
});

const AchievementsUnlockedEvent = z.object({
  event: z.literal("ACHIEVEMENTS_UNLOCKED"),
  payload: z.object({
    achievements: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        rarity: z.enum(["COMMON", "RARE", "EPIC", "LEGENDARY"]),
      })
    ),
  }),
});

const ReauthRequiredEvent = z.object({
  event: z.literal("REAUTH_REQUIRED"),
  payload: z.object({
    reason: z.string(),
    message: z.string(),
  }),
});

export const WsEventSchema = z.discriminatedUnion("event", [
  ErrorEvent,
  LobbyStateUpdatedEvent,
  SeatClaimFailedEvent,
  HandDealtEvent,
  BiddingTurnEvent,
  BiddingCompletedEvent,
  TrumpNamedEvent,
  PassingPhaseStartedEvent,
  CardsPassedEvent,
  CardsReceivedEvent,
  MeldBroadcastEvent,
  MeldAcknowledgedEvent,
  MeldPhaseCompletedEvent,
  YourTurnEvent,
  CardPlayedEvent,
  TrickCompletedEvent,
  TrickStateEvent,
  HandCompletedEvent,
  HandResultAcknowledgedEvent,
  GameOverEvent,
  RematchRequestedEvent,
  RematchStartedEvent,
  GameForfeitedEvent,
  LeftToLobbyEvent,
  AchievementsUnlockedEvent,
  ReauthRequiredEvent,
]);

export type WsEvent = z.infer<typeof WsEventSchema>;

/**
 * Helper type: given an event name, narrow the payload type.
 *
 *     type P = PayloadFor<"HAND_DEALT">  // { cards: string[] }
 */
export type PayloadFor<E extends WsEvent["event"]> =
  Extract<WsEvent, { event: E }>["payload"];

/**
 * Validate a raw, already-JSON-parsed message at the WebSocket boundary.
 * Returns `null` if the shape doesn't match any known event — callers should
 * log and drop the message rather than crash the UI.
 */
export function parseWsEvent(raw: unknown): WsEvent | null {
  const result = WsEventSchema.safeParse(raw);
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.warn("[parseWsEvent] Dropping malformed WS event", {
      raw,
      issues: result.error.issues,
    });
    return null;
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Client → Server actions
// ---------------------------------------------------------------------------

const SelectSeatAction = z.object({
  action: z.literal("SELECT_SEAT"),
  payload: z.object({ seat: z.string() }),
});

const StartGameAction = z.object({
  action: z.literal("START_GAME"),
  // Server accepts missing payload for START_GAME; keep it optional here so
  // existing call sites (sendMessage({ action: "START_GAME" })) stay valid.
  payload: z.object({}).loose().optional(),
});

const SubmitBidAction = z.object({
  action: z.literal("SUBMIT_BID"),
  // `{}` = pass, `{ amount }` = active bid.
  payload: z.union([
    z.object({}).strict(),
    z.object({ amount: z.number().int() }),
  ]),
});

const DeclareTrumpAction = z.object({
  action: z.literal("DECLARE_TRUMP"),
  payload: z.object({
    suit: z.string(),
    shoot_the_moon: z.boolean(),
  }),
});

const PassCardsAction = z.object({
  action: z.literal("PASS_CARDS"),
  payload: z.object({
    cards: z.array(z.string()).length(3),
  }),
});

const AcknowledgeMeldAction = z.object({
  action: z.literal("ACKNOWLEDGE_MELD"),
  payload: z.object({}).loose(),
});

const PlayCardAction = z.object({
  action: z.literal("PLAY_CARD"),
  payload: z.object({ card: z.string() }),
});

const AcknowledgeHandResultAction = z.object({
  action: z.literal("ACKNOWLEDGE_HAND_RESULT"),
  payload: z.object({}).loose(),
});

const RematchRequestAction = z.object({
  action: z.literal("REMATCH_REQUEST"),
  payload: z.object({}).loose(),
});

const LeaveToLobbyAction = z.object({
  action: z.literal("LEAVE_TO_LOBBY"),
  payload: z.object({}).loose(),
});

const SwapSeatRequestAction = z.object({
  action: z.literal("SWAP_SEAT_REQUEST"),
  payload: z.object({ target_seat: z.string() }),
});

const SwapSeatAcceptAction = z.object({
  action: z.literal("SWAP_SEAT_ACCEPT"),
  payload: z.object({}).loose(),
});

const KickPlayerAction = z.object({
  action: z.literal("KICK_PLAYER"),
  payload: z.object({ seat: z.string() }),
});

const FillAiAction = z.object({
  action: z.literal("FILL_AI"),
  payload: z.object({}).loose(),
});

export const WsActionSchema = z.discriminatedUnion("action", [
  SelectSeatAction,
  StartGameAction,
  SubmitBidAction,
  DeclareTrumpAction,
  PassCardsAction,
  AcknowledgeMeldAction,
  PlayCardAction,
  AcknowledgeHandResultAction,
  RematchRequestAction,
  LeaveToLobbyAction,
  SwapSeatRequestAction,
  SwapSeatAcceptAction,
  KickPlayerAction,
  FillAiAction,
]);

export type WsAction = z.infer<typeof WsActionSchema>;

/**
 * Type-checked WebSocket send. The discriminated union ensures the payload
 * shape matches the action name at compile time.
 *
 *     sendAction(send, { action: "PLAY_CARD", payload: { card: "AC" } })
 *
 * `send` is any function that takes a JSON-serializable message — matches the
 * signature of both web and mobile `sendMessage`.
 */
export function sendAction(
  send: (msg: Record<string, unknown>) => boolean | void,
  action: WsAction,
): boolean | void {
  return send(action as unknown as Record<string, unknown>);
}
