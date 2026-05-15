import { describe, expect, it } from "vitest";
import { detectMoonOutcome } from "./moonOutcome";
import { initialGameState, type GameState } from "./gameReducer";

function moonState(overrides: Partial<GameState> = {}): GameState {
  const base = initialGameState([]);
  return {
    ...base,
    phase: "HAND_COMPLETE",
    meldData: {
      trump_suit: "hearts",
      winning_bid: 1500,
      is_shoot_the_moon: true,
      bidding_team: "NS",
      team_meld: { NS: 40, EW: 10 },
      player_melds: {},
    },
    tricksTaken: { NS: 12, EW: 0 },
    trickScores: { NS: 250, EW: 0 },
    handResult: {
      trick_scores: { NS: 250, EW: 0 },
      team_meld: { NS: 40, EW: 10 },
      bid: 1500,
      bidding_team: "NS",
      score_deltas: { NS: 1540, EW: 0 },
      game_scores: { NS: 1540, EW: 0 },
    },
    ...overrides,
  };
}

describe("detectMoonOutcome", () => {
  it("returns none when phase is not HAND_COMPLETE", () => {
    const state = moonState({ phase: "TRICK_PLAYING" });
    expect(detectMoonOutcome(state)).toEqual({ kind: "none" });
  });

  it("returns none when no moon was declared", () => {
    const state = moonState({
      meldData: {
        trump_suit: "hearts",
        winning_bid: 50,
        is_shoot_the_moon: false,
        bidding_team: "NS",
        team_meld: { NS: 20, EW: 10 },
        player_melds: {},
      },
    });
    expect(detectMoonOutcome(state)).toEqual({ kind: "none" });
  });

  it("returns success when bidding team took all 12 tricks", () => {
    expect(detectMoonOutcome(moonState())).toEqual({
      kind: "success",
      team: "NS",
    });
  });

  it("returns fail when moon was declared but bidding team missed a trick", () => {
    const state = moonState({ tricksTaken: { NS: 11, EW: 1 } });
    expect(detectMoonOutcome(state)).toEqual({ kind: "fail", team: "NS" });
  });

  it("returns fail when bidding team took zero tricks", () => {
    const state = moonState({ tricksTaken: { NS: 0, EW: 12 } });
    expect(detectMoonOutcome(state)).toEqual({ kind: "fail", team: "NS" });
  });

  it("works for EW as the moon-shooting team", () => {
    const state = moonState({
      meldData: {
        trump_suit: "spades",
        winning_bid: 1500,
        is_shoot_the_moon: true,
        bidding_team: "EW",
        team_meld: { NS: 0, EW: 60 },
        player_melds: {},
      },
      tricksTaken: { NS: 0, EW: 12 },
      handResult: {
        trick_scores: { NS: 0, EW: 250 },
        team_meld: { NS: 0, EW: 60 },
        bid: 1500,
        bidding_team: "EW",
        score_deltas: { NS: 0, EW: 1560 },
        game_scores: { NS: 0, EW: 1560 },
      },
    });
    expect(detectMoonOutcome(state)).toEqual({ kind: "success", team: "EW" });
  });

  it("returns none when handResult is missing (defensive)", () => {
    const state = moonState({ handResult: null });
    expect(detectMoonOutcome(state)).toEqual({ kind: "none" });
  });
});
