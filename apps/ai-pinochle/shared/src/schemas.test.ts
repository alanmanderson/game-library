/**
 * Boundary-validation tests for parseWsEvent.
 *
 * These guard the client against server contract drift: if the server
 * changes a payload shape without the client knowing, parseWsEvent returns
 * null and the UI drops the message instead of crashing.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { parseWsEvent, WsActionSchema } from "./schemas";

describe("parseWsEvent — known-good events", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a HAND_DEALT with cards array", () => {
    const result = parseWsEvent({
      event: "HAND_DEALT",
      payload: { cards: ["AH", "KS", "10C"] },
    });
    expect(result).not.toBeNull();
    if (result && result.event === "HAND_DEALT") {
      // Narrowed by discriminant — payload.cards is string[].
      expect(result.payload.cards).toEqual(["AH", "KS", "10C"]);
    }
  });

  it("accepts a BIDDING_TURN with null highest_bidder_seat", () => {
    const result = parseWsEvent({
      event: "BIDDING_TURN",
      payload: {
        current_highest_bid: null,
        highest_bidder_seat: null,
        next_to_act_seat: "NORTH",
        minimum_valid_bid: 25,
      },
    });
    expect(result).not.toBeNull();
    if (result && result.event === "BIDDING_TURN") {
      expect(result.payload.minimum_valid_bid).toBe(25);
      expect(result.payload.highest_bidder_seat).toBeNull();
    }
  });

  it("accepts an ERROR event with a known error code", () => {
    const result = parseWsEvent({
      event: "ERROR",
      payload: { code: "ILLEGAL_PLAY", message: "That card is not legal" },
    });
    expect(result).not.toBeNull();
    if (result && result.event === "ERROR") {
      expect(result.payload.code).toBe("ILLEGAL_PLAY");
    }
  });

  it("accepts GAME_FORFEITED with the full payload shape", () => {
    const result = parseWsEvent({
      event: "GAME_FORFEITED",
      payload: {
        winning_team: "NS",
        forfeiting_team: "EW",
        forfeiting_seat: "EAST",
        final_scores: { NS: 250, EW: 120 },
      },
    });
    expect(result).not.toBeNull();
    if (result && result.event === "GAME_FORFEITED") {
      expect(result.payload.winning_team).toBe("NS");
      expect(result.payload.final_scores.NS).toBe(250);
    }
  });
});

describe("parseWsEvent — malformed input", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for an unknown event name", () => {
    const result = parseWsEvent({
      event: "TOTALLY_MADE_UP_EVENT",
      payload: {},
    });
    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns null when a required field is missing (HAND_DEALT.cards)", () => {
    const result = parseWsEvent({
      event: "HAND_DEALT",
      payload: {}, // cards missing
    });
    expect(result).toBeNull();
  });

  it("returns null when a field has the wrong type (BIDDING_TURN.minimum_valid_bid)", () => {
    const result = parseWsEvent({
      event: "BIDDING_TURN",
      payload: {
        current_highest_bid: null,
        highest_bidder_seat: null,
        next_to_act_seat: "NORTH",
        minimum_valid_bid: "twenty-five", // should be number
      },
    });
    expect(result).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseWsEvent(null)).toBeNull();
    expect(parseWsEvent("string-payload")).toBeNull();
    expect(parseWsEvent(42)).toBeNull();
  });

  it("returns null when ERROR.code is not in the allowed enum", () => {
    const result = parseWsEvent({
      event: "ERROR",
      payload: { code: "NOT_A_REAL_CODE", message: "..." },
    });
    expect(result).toBeNull();
  });
});

describe("WsActionSchema — outbound action validation", () => {
  it("accepts a SUBMIT_BID pass (empty payload)", () => {
    const result = WsActionSchema.safeParse({
      action: "SUBMIT_BID",
      payload: {},
    });
    expect(result.success).toBe(true);
  });

  it("accepts a SUBMIT_BID with an integer amount", () => {
    const result = WsActionSchema.safeParse({
      action: "SUBMIT_BID",
      payload: { amount: 30 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects PASS_CARDS with the wrong card count", () => {
    const tooFew = WsActionSchema.safeParse({
      action: "PASS_CARDS",
      payload: { cards: ["AH", "KS"] },
    });
    expect(tooFew.success).toBe(false);

    const tooMany = WsActionSchema.safeParse({
      action: "PASS_CARDS",
      payload: { cards: ["AH", "KS", "10C", "QD"] },
    });
    expect(tooMany.success).toBe(false);
  });

  it("rejects an unknown action name", () => {
    const result = WsActionSchema.safeParse({
      action: "HACK_THE_PLANET",
      payload: {},
    });
    expect(result.success).toBe(false);
  });
});
