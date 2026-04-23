import { describe, it, expect, beforeEach } from "vitest";
import { GameStore } from "../game/GameStore.js";
import type { Game } from "../models/types.js";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: overrides.id ?? "game-1",
    code: overrides.code ?? "ABCD",
    state: "LOBBY",
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
        orderIndex: null,
        socketId: null,
      },
    ],
    chains: [],
    currentRound: 0,
    totalRounds: 0,
    roundStartedAt: null,
    roundEndsAt: null,
    submittedPlayerIds: new Set(),
    reviewCursor: null,
    createdAt: Date.now(),
    endedAt: null,
    ...overrides,
  };
}

describe("GameStore", () => {
  let store: GameStore;

  beforeEach(() => {
    store = new GameStore();
  });

  describe("create and get", () => {
    it("stores a game retrievable by ID", () => {
      const game = makeGame();
      store.create(game);
      expect(store.getById("game-1")).toBe(game);
    });

    it("stores a game retrievable by code", () => {
      const game = makeGame();
      store.create(game);
      expect(store.getByCode("ABCD")).toBe(game);
    });

    it("getById returns undefined for non-existent ID", () => {
      expect(store.getById("nope")).toBeUndefined();
    });

    it("getByCode returns undefined for non-existent code", () => {
      expect(store.getByCode("ZZZZ")).toBeUndefined();
    });
  });

  describe("case-insensitive code lookup", () => {
    it("getByCode is case-insensitive", () => {
      const game = makeGame({ code: "FROG" });
      store.create(game);
      expect(store.getByCode("frog")).toBe(game);
      expect(store.getByCode("Frog")).toBe(game);
      expect(store.getByCode("FROG")).toBe(game);
    });

    it("isCodeInUse is case-insensitive", () => {
      const game = makeGame({ code: "FROG" });
      store.create(game);
      expect(store.isCodeInUse("frog")).toBe(true);
      expect(store.isCodeInUse("FROG")).toBe(true);
      expect(store.isCodeInUse("ABCD")).toBe(false);
    });
  });

  describe("delete", () => {
    it("removes game from both maps", () => {
      const game = makeGame();
      store.create(game);
      store.delete("game-1");
      expect(store.getById("game-1")).toBeUndefined();
      expect(store.getByCode("ABCD")).toBeUndefined();
    });

    it("deleting non-existent game is a no-op", () => {
      expect(() => store.delete("nope")).not.toThrow();
    });
  });

  describe("getAll", () => {
    it("returns all stored games", () => {
      store.create(makeGame({ id: "g1", code: "AAAA" }));
      store.create(makeGame({ id: "g2", code: "BBBB" }));
      store.create(makeGame({ id: "g3", code: "CCCC" }));
      const all = store.getAll();
      expect(all).toHaveLength(3);
      expect(all.map((g) => g.id).sort()).toEqual(["g1", "g2", "g3"]);
    });

    it("returns empty array when no games exist", () => {
      expect(store.getAll()).toEqual([]);
    });
  });

  describe("size and totalConnectedPlayers", () => {
    it("size reflects number of games", () => {
      expect(store.size()).toBe(0);
      store.create(makeGame({ id: "g1", code: "AAAA" }));
      expect(store.size()).toBe(1);
      store.create(makeGame({ id: "g2", code: "BBBB" }));
      expect(store.size()).toBe(2);
      store.delete("g1");
      expect(store.size()).toBe(1);
    });

    it("totalConnectedPlayers counts connected players across games", () => {
      const game1 = makeGame({ id: "g1", code: "AAAA" });
      game1.players = [
        { id: "p1", displayName: "A", isHost: true, isConnected: true, reconnectionToken: "t", joinOrder: 0, orderIndex: null, socketId: null },
        { id: "p2", displayName: "B", isHost: false, isConnected: false, reconnectionToken: "t", joinOrder: 1, orderIndex: null, socketId: null },
      ];
      const game2 = makeGame({ id: "g2", code: "BBBB" });
      game2.players = [
        { id: "p3", displayName: "C", isHost: true, isConnected: true, reconnectionToken: "t", joinOrder: 0, orderIndex: null, socketId: null },
        { id: "p4", displayName: "D", isHost: false, isConnected: true, reconnectionToken: "t", joinOrder: 1, orderIndex: null, socketId: null },
      ];
      store.create(game1);
      store.create(game2);
      expect(store.totalConnectedPlayers()).toBe(3);
    });
  });

  describe("update", () => {
    it("is a no-op for in-memory store (mutations are already visible)", () => {
      const game = makeGame();
      store.create(game);
      game.state = "PROMPT";
      store.update(game);
      expect(store.getById("game-1")!.state).toBe("PROMPT");
    });
  });
});
