import { describe, it, expect } from "vitest";
import {
  getChainIndexForPlayer,
  getInputForPlayer,
  initializeChains,
  addEntryToChain,
  getEntryTypeForRound,
} from "../game/ChainManager.js";
import type { Game, Chain } from "../models/types.js";

function makeGame(playerCount: number): Game {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i}`,
    displayName: `Player ${i}`,
    isHost: i === 0,
    isConnected: true,
    reconnectionToken: `token-${i}`,
    joinOrder: i,
    orderIndex: i,
    socketId: null,
  }));

  return {
    id: "test-id",
    code: "TEST",
    state: "PROMPT",
    hostPlayerId: "p0",
    settings: {
      drawingTimerSeconds: 60,
      guessingTimerSeconds: 30,
      promptTimerSeconds: 30,
      useAllRounds: true,
      customRoundCount: null,
    },
    players,
    chains: initializeChains(playerCount),
    currentRound: 0,
    totalRounds: playerCount,
    roundStartedAt: Date.now(),
    roundEndsAt: Date.now() + 30000,
    submittedPlayerIds: new Set(),
    reviewCursor: null,
    createdAt: Date.now(),
    endedAt: null,
  };
}

describe("getChainIndexForPlayer", () => {
  it("round 0: each player gets their own chain", () => {
    for (let N = 4; N <= 8; N++) {
      for (let p = 0; p < N; p++) {
        expect(getChainIndexForPlayer(p, 0, N)).toBe(p);
      }
    }
  });

  it("follows the formula (P - R + N) % N", () => {
    const N = 5;
    // round 1: player 0 gets chain (0-1+5)%5 = 4
    expect(getChainIndexForPlayer(0, 1, N)).toBe(4);
    // round 1: player 1 gets chain (1-1+5)%5 = 0
    expect(getChainIndexForPlayer(1, 1, N)).toBe(0);
    // round 2: player 0 gets chain (0-2+5)%5 = 3
    expect(getChainIndexForPlayer(0, 2, N)).toBe(3);
  });

  it("every player touches every chain exactly once across all rounds", () => {
    for (const N of [4, 5, 6, 7, 8]) {
      // For each player, collect which chains they visit over N rounds
      for (let p = 0; p < N; p++) {
        const chains = new Set<number>();
        for (let r = 0; r < N; r++) {
          chains.add(getChainIndexForPlayer(p, r, N));
        }
        expect(chains.size).toBe(N);
      }
    }
  });

  it("no player sees their own chain in rounds 1..N-1", () => {
    for (const N of [4, 5, 6, 7, 8, 20]) {
      for (let p = 0; p < N; p++) {
        for (let r = 1; r < N; r++) {
          const chainIdx = getChainIndexForPlayer(p, r, N);
          expect(chainIdx).not.toBe(p);
        }
      }
    }
  });

  it("every chain is touched by exactly one player per round", () => {
    for (const N of [4, 5, 6, 8]) {
      for (let r = 0; r < N; r++) {
        const chainsThisRound = new Set<number>();
        for (let p = 0; p < N; p++) {
          chainsThisRound.add(getChainIndexForPlayer(p, r, N));
        }
        expect(chainsThisRound.size).toBe(N);
      }
    }
  });
});

describe("initializeChains", () => {
  it("creates one chain per player", () => {
    const chains = initializeChains(5);
    expect(chains).toHaveLength(5);
  });

  it("each chain has the correct originPlayerIndex and empty entries", () => {
    const chains = initializeChains(4);
    chains.forEach((chain, i) => {
      expect(chain.originPlayerIndex).toBe(i);
      expect(chain.entries).toEqual([]);
    });
  });
});

describe("addEntryToChain", () => {
  it("adds an entry to the correct chain for round 0", () => {
    const game = makeGame(4);
    addEntryToChain(game, 0, 0, {
      type: "PROMPT",
      playerId: "p0",
      playerDisplayName: "Player 0",
      content: "elephant",
      submittedAt: Date.now(),
      wasAutoSubmitted: false,
    });

    expect(game.chains[0].entries).toHaveLength(1);
    expect(game.chains[0].entries[0].content).toBe("elephant");
  });

  it("adds entry to the rotated chain in later rounds", () => {
    const game = makeGame(4);
    // Round 0: player 0 writes to chain 0
    addEntryToChain(game, 0, 0, {
      type: "PROMPT",
      playerId: "p0",
      playerDisplayName: "Player 0",
      content: "elephant",
      submittedAt: Date.now(),
      wasAutoSubmitted: false,
    });

    // Round 1: player 0 writes to chain (0-1+4)%4 = 3
    addEntryToChain(game, 0, 1, {
      type: "DRAWING",
      playerId: "p0",
      playerDisplayName: "Player 0",
      content: "drawing-data",
      submittedAt: Date.now(),
      wasAutoSubmitted: false,
    });

    expect(game.chains[3].entries).toHaveLength(1);
    expect(game.chains[3].entries[0].content).toBe("drawing-data");
  });

  it("throws if chain index is out of bounds", () => {
    const game = makeGame(4);
    // Manually mess with chains to have fewer
    game.chains = [{ originPlayerIndex: 0, entries: [] }];
    expect(() =>
      addEntryToChain(game, 3, 0, {
        type: "PROMPT",
        playerId: "p3",
        playerDisplayName: "Player 3",
        content: "test",
        submittedAt: Date.now(),
        wasAutoSubmitted: false,
      })
    ).toThrow("Chain 3 not found");
  });
});

describe("getInputForPlayer", () => {
  it("returns empty for round 0 (prompt phase)", () => {
    const game = makeGame(4);
    const input = getInputForPlayer(game, 0, 0);
    expect(input).toEqual({});
  });

  it("returns the text prompt for a drawing round", () => {
    const game = makeGame(4);
    // Set up: in round 0, all players write prompts
    for (let p = 0; p < 4; p++) {
      addEntryToChain(game, p, 0, {
        type: "PROMPT",
        playerId: `p${p}`,
        playerDisplayName: `Player ${p}`,
        content: `word${p}`,
        submittedAt: Date.now(),
        wasAutoSubmitted: false,
      });
    }

    // Round 1: player 0 gets chain (0-1+4)%4 = 3 => "word3"
    const input = getInputForPlayer(game, 0, 1);
    expect(input.prompt).toBe("word3");
    expect(input.promptAuthorDisplayName).toBe("Player 3");
    expect(input.drawing).toBeUndefined();
  });

  it("returns the drawing for a guessing round", () => {
    const game = makeGame(4);

    // Round 0: prompts
    for (let p = 0; p < 4; p++) {
      addEntryToChain(game, p, 0, {
        type: "PROMPT",
        playerId: `p${p}`,
        playerDisplayName: `Player ${p}`,
        content: `word${p}`,
        submittedAt: Date.now(),
        wasAutoSubmitted: false,
      });
    }

    // Round 1: drawings
    for (let p = 0; p < 4; p++) {
      addEntryToChain(game, p, 1, {
        type: "DRAWING",
        playerId: `p${p}`,
        playerDisplayName: `Player ${p}`,
        content: `drawing-by-p${p}`,
        submittedAt: Date.now(),
        wasAutoSubmitted: false,
      });
    }

    // Round 2: player 0 gets chain (0-2+4)%4 = 2
    // Chain 2 has prompt by p2 and drawing by the player who got chain 2 in round 1
    // In round 1, player p who gets chain 2: (p-1+4)%4 = 2 => p = 3
    const input = getInputForPlayer(game, 0, 2);
    expect(input.drawing).toBe("drawing-by-p3");
    expect(input.drawingAuthorDisplayName).toBe("Player 3");
    expect(input.prompt).toBeUndefined();
  });

  it("returns empty when chain has no entries", () => {
    const game = makeGame(4);
    // chains are initialized but empty
    const input = getInputForPlayer(game, 0, 1);
    expect(input).toEqual({});
  });
});

describe("getEntryTypeForRound", () => {
  it("round 0 is PROMPT", () => {
    expect(getEntryTypeForRound(0)).toBe("PROMPT");
  });

  it("odd rounds are DRAWING", () => {
    expect(getEntryTypeForRound(1)).toBe("DRAWING");
    expect(getEntryTypeForRound(3)).toBe("DRAWING");
  });

  it("even rounds > 0 are GUESS", () => {
    expect(getEntryTypeForRound(2)).toBe("GUESS");
    expect(getEntryTypeForRound(4)).toBe("GUESS");
  });
});
