import { describe, it, expect } from "vitest";
import {
  getRoundType,
  hasMoreRounds,
  getNextStateAfterRound,
  canTransition,
  transition,
} from "../game/StateMachine.js";
import type { Game, GameState } from "../models/types.js";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "test-id",
    code: "TEST",
    state: "LOBBY" as GameState,
    hostPlayerId: "host-1",
    settings: {
      drawingTimerSeconds: 60,
      guessingTimerSeconds: 30,
      promptTimerSeconds: 30,
      useAllRounds: true,
      customRoundCount: null,
    },
    players: [
      {
        id: "host-1",
        displayName: "Host",
        isHost: true,
        isConnected: true,
        reconnectionToken: "t1",
        joinOrder: 0,
        orderIndex: 0,
        socketId: null,
      },
      {
        id: "p2",
        displayName: "P2",
        isHost: false,
        isConnected: true,
        reconnectionToken: "t2",
        joinOrder: 1,
        orderIndex: 1,
        socketId: null,
      },
      {
        id: "p3",
        displayName: "P3",
        isHost: false,
        isConnected: true,
        reconnectionToken: "t3",
        joinOrder: 2,
        orderIndex: 2,
        socketId: null,
      },
      {
        id: "p4",
        displayName: "P4",
        isHost: false,
        isConnected: true,
        reconnectionToken: "t4",
        joinOrder: 3,
        orderIndex: 3,
        socketId: null,
      },
    ],
    chains: [],
    currentRound: 0,
    totalRounds: 4, // 4 players => 3 rounds + 1 prompt = 4 total
    roundStartedAt: null,
    roundEndsAt: null,
    submittedPlayerIds: new Set(),
    reviewCursor: null,
    createdAt: Date.now(),
    endedAt: null,
    ...overrides,
  };
}

describe("getRoundType", () => {
  it("round 0 is PROMPT", () => {
    expect(getRoundType(0)).toBe("PROMPT");
  });

  it("odd rounds are DRAWING", () => {
    expect(getRoundType(1)).toBe("DRAWING");
    expect(getRoundType(3)).toBe("DRAWING");
    expect(getRoundType(5)).toBe("DRAWING");
    expect(getRoundType(7)).toBe("DRAWING");
  });

  it("even rounds > 0 are GUESSING", () => {
    expect(getRoundType(2)).toBe("GUESSING");
    expect(getRoundType(4)).toBe("GUESSING");
    expect(getRoundType(6)).toBe("GUESSING");
  });
});

describe("hasMoreRounds", () => {
  it("returns true when currentRound < totalRounds - 1", () => {
    const game = makeGame({ currentRound: 0, totalRounds: 4 });
    expect(hasMoreRounds(game)).toBe(true);
  });

  it("returns true at the second to last round", () => {
    const game = makeGame({ currentRound: 2, totalRounds: 4 });
    expect(hasMoreRounds(game)).toBe(true);
  });

  it("returns false when currentRound equals totalRounds - 1", () => {
    const game = makeGame({ currentRound: 3, totalRounds: 4 });
    expect(hasMoreRounds(game)).toBe(false);
  });

  it("returns false when currentRound exceeds totalRounds - 1", () => {
    const game = makeGame({ currentRound: 5, totalRounds: 4 });
    expect(hasMoreRounds(game)).toBe(false);
  });

  it("correct for various player counts", () => {
    // 5 players => totalRounds = 5 (prompt + 4 rounds)
    const game5 = makeGame({ currentRound: 3, totalRounds: 5 });
    expect(hasMoreRounds(game5)).toBe(true);
    game5.currentRound = 4;
    expect(hasMoreRounds(game5)).toBe(false);

    // 6 players => totalRounds = 6
    const game6 = makeGame({ currentRound: 5, totalRounds: 6 });
    expect(hasMoreRounds(game6)).toBe(false);
  });
});

describe("getNextStateAfterRound", () => {
  it("returns DRAWING when next round is odd", () => {
    const game = makeGame({ currentRound: 0, totalRounds: 4 });
    expect(getNextStateAfterRound(game)).toBe("DRAWING");
  });

  it("returns GUESSING when next round is even and > 0", () => {
    const game = makeGame({ currentRound: 1, totalRounds: 4 });
    expect(getNextStateAfterRound(game)).toBe("GUESSING");
  });

  it("returns REVIEW when no more rounds remain", () => {
    const game = makeGame({ currentRound: 3, totalRounds: 4 });
    expect(getNextStateAfterRound(game)).toBe("REVIEW");
  });
});

describe("canTransition", () => {
  it("LOBBY -> PROMPT valid with host and >= 4 players", () => {
    const game = makeGame({ state: "LOBBY" });
    const result = canTransition(game, "LOBBY", "PROMPT", { senderId: "host-1" });
    expect(result.valid).toBe(true);
  });

  it("LOBBY -> PROMPT invalid if non-host", () => {
    const game = makeGame({ state: "LOBBY" });
    const result = canTransition(game, "LOBBY", "PROMPT", { senderId: "p2" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("host");
  });

  it("LOBBY -> PROMPT invalid with fewer than 4 connected players", () => {
    const game = makeGame({ state: "LOBBY" });
    game.players[1].isConnected = false;
    game.players[2].isConnected = false;
    const result = canTransition(game, "LOBBY", "PROMPT", { senderId: "host-1" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("4");
  });

  it("PROMPT -> DRAWING valid when all submitted", () => {
    const game = makeGame({ state: "PROMPT", currentRound: 0, totalRounds: 4 });
    const result = canTransition(game, "PROMPT", "DRAWING", { allSubmitted: true });
    expect(result.valid).toBe(true);
  });

  it("PROMPT -> DRAWING valid when timer expired", () => {
    const game = makeGame({ state: "PROMPT", currentRound: 0, totalRounds: 4 });
    const result = canTransition(game, "PROMPT", "DRAWING", { timerExpired: true });
    expect(result.valid).toBe(true);
  });

  it("PROMPT -> DRAWING invalid when neither submitted nor expired", () => {
    const game = makeGame({ state: "PROMPT", currentRound: 0, totalRounds: 4 });
    const result = canTransition(game, "PROMPT", "DRAWING", {});
    expect(result.valid).toBe(false);
  });

  it("DRAWING -> GUESSING valid with more rounds", () => {
    const game = makeGame({ state: "DRAWING", currentRound: 1, totalRounds: 4 });
    const result = canTransition(game, "DRAWING", "GUESSING", { allSubmitted: true });
    expect(result.valid).toBe(true);
  });

  it("DRAWING -> REVIEW valid on final round", () => {
    const game = makeGame({ state: "DRAWING", currentRound: 3, totalRounds: 4 });
    const result = canTransition(game, "DRAWING", "REVIEW", { allSubmitted: true });
    expect(result.valid).toBe(true);
  });

  it("DRAWING -> REVIEW invalid when more rounds remain", () => {
    const game = makeGame({ state: "DRAWING", currentRound: 1, totalRounds: 4 });
    const result = canTransition(game, "DRAWING", "REVIEW", { allSubmitted: true });
    expect(result.valid).toBe(false);
  });

  it("GUESSING -> DRAWING valid with more rounds", () => {
    const game = makeGame({ state: "GUESSING", currentRound: 2, totalRounds: 4 });
    const result = canTransition(game, "GUESSING", "DRAWING", { allSubmitted: true });
    expect(result.valid).toBe(true);
  });

  it("GUESSING -> REVIEW valid on final round", () => {
    const game = makeGame({ state: "GUESSING", currentRound: 3, totalRounds: 4 });
    const result = canTransition(game, "GUESSING", "REVIEW", { allSubmitted: true });
    expect(result.valid).toBe(true);
  });

  it("REVIEW -> ENDED is always valid", () => {
    const game = makeGame({ state: "REVIEW" });
    const result = canTransition(game, "REVIEW", "ENDED");
    expect(result.valid).toBe(true);
  });

  it("rejects invalid transitions (e.g. LOBBY -> REVIEW)", () => {
    const game = makeGame({ state: "LOBBY" });
    const result = canTransition(game, "LOBBY", "REVIEW");
    expect(result.valid).toBe(false);
  });

  it("rejects if game.state does not match from parameter", () => {
    const game = makeGame({ state: "DRAWING" });
    const result = canTransition(game, "LOBBY", "PROMPT");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("DRAWING");
  });

  it("PROMPT -> REVIEW valid on final round (1 player game edge)", () => {
    // Hypothetical: totalRounds = 1 => only prompt round, no more rounds
    const game = makeGame({ state: "PROMPT", currentRound: 0, totalRounds: 1 });
    const result = canTransition(game, "PROMPT", "REVIEW", { allSubmitted: true });
    expect(result.valid).toBe(true);
  });
});

describe("transition", () => {
  it("mutates game state on valid transition", () => {
    const game = makeGame({ state: "LOBBY" });
    const result = transition(game, "PROMPT", { senderId: "host-1" });
    expect(result.state).toBe("PROMPT");
    expect(game.state).toBe("PROMPT");
  });

  it("throws on invalid transition", () => {
    const game = makeGame({ state: "LOBBY" });
    expect(() => transition(game, "REVIEW")).toThrow();
  });
});
