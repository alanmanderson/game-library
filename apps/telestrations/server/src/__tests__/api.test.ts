import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { GameManager } from "../game/GameManager.js";
import { GameStore } from "../game/GameStore.js";
import { TimerService } from "../game/TimerService.js";

// Mock the rate limiter module to be pass-through in tests
vi.mock("../middleware/rateLimiter.js", () => {
  const passThrough = (_req: any, _res: any, next: any) => next();
  return {
    createGameLimiter: passThrough,
    joinGameLimiter: passThrough,
    getGameLimiter: passThrough,
    getResultsLimiter: passThrough,
  };
});

// Import createApp AFTER the mock is set up
const { createApp } = await import("../app.js");

describe("REST API", () => {
  let app: express.Application;
  let gm: GameManager;
  let store: GameStore;
  let timers: TimerService;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new GameStore();
    timers = new TimerService();
    gm = new GameManager(store, timers);
    app = createApp(gm);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --------------- POST /api/games ---------------

  describe("POST /api/games", () => {
    it("creates a game and returns 201", async () => {
      const res = await request(app)
        .post("/api/games")
        .send({ hostDisplayName: "Alice" })
        .expect(201);

      expect(res.body.gameCode).toHaveLength(4);
      expect(res.body.gameId).toBeDefined();
      expect(res.body.playerId).toBeDefined();
      expect(res.body.reconnectionToken).toBeDefined();
      expect(res.body.settings).toBeDefined();
      expect(res.body.settings.drawingTimerSeconds).toBe(60);
    });

    it("creates a game with custom settings", async () => {
      const res = await request(app)
        .post("/api/games")
        .send({
          hostDisplayName: "Alice",
          settings: { drawingTimerSeconds: 90, guessingTimerSeconds: 45 },
        })
        .expect(201);

      expect(res.body.settings.drawingTimerSeconds).toBe(90);
      expect(res.body.settings.guessingTimerSeconds).toBe(45);
    });

    it("rejects missing display name", async () => {
      const res = await request(app)
        .post("/api/games")
        .send({})
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects display name too short", async () => {
      const res = await request(app)
        .post("/api/games")
        .send({ hostDisplayName: "A" })
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects display name too long", async () => {
      const res = await request(app)
        .post("/api/games")
        .send({ hostDisplayName: "A".repeat(17) })
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });

    it("rejects display name with special characters", async () => {
      const res = await request(app)
        .post("/api/games")
        .send({ hostDisplayName: "Al!ce" })
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  // --------------- POST /api/games/:code/join ---------------

  describe("POST /api/games/:code/join", () => {
    it("joins an existing game and returns player data", async () => {
      const createRes = await request(app)
        .post("/api/games")
        .send({ hostDisplayName: "Alice" })
        .expect(201);

      const code = createRes.body.gameCode;

      const joinRes = await request(app)
        .post(`/api/games/${code}/join`)
        .send({ displayName: "Bob" })
        .expect(200);

      expect(joinRes.body.gameCode).toBe(code);
      expect(joinRes.body.playerId).toBeDefined();
      expect(joinRes.body.reconnectionToken).toBeDefined();
      expect(joinRes.body.gameState).toBe("LOBBY");
      expect(joinRes.body.players).toHaveLength(2);
    });

    it("game code is case-insensitive", async () => {
      const createRes = await request(app)
        .post("/api/games")
        .send({ hostDisplayName: "Alice" })
        .expect(201);

      const code = createRes.body.gameCode.toLowerCase();

      const joinRes = await request(app)
        .post(`/api/games/${code}/join`)
        .send({ displayName: "Bob" })
        .expect(200);

      expect(joinRes.body.playerId).toBeDefined();
    });

    it("rejects non-existent game code", async () => {
      const res = await request(app)
        .post("/api/games/ZZZZ/join")
        .send({ displayName: "Bob" })
        .expect(404);

      expect(res.body.code).toBe("GAME_NOT_FOUND");
    });

    it("rejects duplicate display name", async () => {
      const createRes = await request(app)
        .post("/api/games")
        .send({ hostDisplayName: "Alice" })
        .expect(201);

      const code = createRes.body.gameCode;

      const res = await request(app)
        .post(`/api/games/${code}/join`)
        .send({ displayName: "Alice" })
        .expect(409);

      expect(res.body.code).toBe("DISPLAY_NAME_TAKEN");
    });

    it("rejects a started game", async () => {
      const createRes = await request(app)
        .post("/api/games")
        .send({ hostDisplayName: "Host" })
        .expect(201);

      const code = createRes.body.gameCode;
      const game = store.getByCode(code)!;

      // Manually add players and start the game
      for (let i = 1; i < 4; i++) {
        gm.joinGame(code, `Player${i}`);
      }
      game.players.forEach((p) => (p.isConnected = true));
      gm.startGame(game, game.players[0]);

      const res = await request(app)
        .post(`/api/games/${code}/join`)
        .send({ displayName: "Late" })
        .expect(409);

      expect(res.body.code).toBe("GAME_ALREADY_STARTED");
    });

    it("rejects invalid game code format (too short)", async () => {
      const res = await request(app)
        .post("/api/games/AB/join")
        .send({ displayName: "Bob" })
        .expect(400);

      expect(res.body.code).toBe("INVALID_GAME_CODE");
    });

    it("rejects game code with excluded letters (I, O, L)", async () => {
      const res = await request(app)
        .post("/api/games/OILX/join")
        .send({ displayName: "Bob" })
        .expect(400);

      expect(res.body.code).toBe("INVALID_GAME_CODE");
    });

    it("rejects missing display name", async () => {
      const createRes = await request(app)
        .post("/api/games")
        .send({ hostDisplayName: "Alice" })
        .expect(201);

      const code = createRes.body.gameCode;
      const res = await request(app)
        .post(`/api/games/${code}/join`)
        .send({})
        .expect(400);

      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });

  // --------------- GET /api/games/:code ---------------

  describe("GET /api/games/:code", () => {
    it("returns game status for an existing game", async () => {
      const createRes = await request(app)
        .post("/api/games")
        .send({ hostDisplayName: "Alice" })
        .expect(201);

      const code = createRes.body.gameCode;

      const res = await request(app)
        .get(`/api/games/${code}`)
        .expect(200);

      expect(res.body.gameCode).toBe(code);
      expect(res.body.state).toBe("LOBBY");
      expect(res.body.playerCount).toBe(1);
      expect(res.body.maxPlayers).toBe(20);
      expect(res.body.canJoin).toBe(true);
    });

    it("case-insensitive code lookup", async () => {
      const createRes = await request(app)
        .post("/api/games")
        .send({ hostDisplayName: "Alice" })
        .expect(201);

      const code = createRes.body.gameCode.toLowerCase();

      const res = await request(app)
        .get(`/api/games/${code}`)
        .expect(200);

      expect(res.body.state).toBe("LOBBY");
    });

    it("returns 404 for non-existent game", async () => {
      const res = await request(app)
        .get("/api/games/ZZZZ")
        .expect(404);

      expect(res.body.code).toBe("GAME_NOT_FOUND");
    });

    it("returns canJoin=false for started game", async () => {
      const createRes = await request(app)
        .post("/api/games")
        .send({ hostDisplayName: "Host" })
        .expect(201);

      const code = createRes.body.gameCode;
      const game = store.getByCode(code)!;

      for (let i = 1; i < 4; i++) {
        gm.joinGame(code, `Player${i}`);
      }
      game.players.forEach((p) => (p.isConnected = true));
      gm.startGame(game, game.players[0]);

      const res = await request(app)
        .get(`/api/games/${code}`)
        .expect(200);

      expect(res.body.canJoin).toBe(false);
    });

    it("rejects invalid game code format", async () => {
      const res = await request(app)
        .get("/api/games/12")
        .expect(400);

      expect(res.body.code).toBe("INVALID_GAME_CODE");
    });
  });

  // --------------- GET /api/games/:code/results ---------------

  describe("GET /api/games/:code/results", () => {
    function setupEndedGame(): {
      code: string;
      hostId: string;
      game: ReturnType<GameStore["getByCode"]>;
    } {
      const { game, hostPlayer } = gm.createGame("Host");
      const code = game.code;
      const hostId = hostPlayer.id;

      for (let i = 1; i < 4; i++) {
        gm.joinGame(code, `Player${i}`);
      }
      game.players.forEach((p) => (p.isConnected = true));
      gm.startGame(game, game.players[0]);

      // Fast-forward through all rounds
      for (let round = 0; round < game.totalRounds; round++) {
        for (const p of game.players) {
          if (game.state === "DRAWING") {
            gm.handleSubmission(
              game,
              p,
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
            );
          } else {
            gm.handleSubmission(game, p, `content-${round}`);
          }
        }
        vi.advanceTimersByTime(3100);
      }

      // Navigate review to ENDED
      const host = game.players.find((p) => p.isHost)!;
      while (game.state === "REVIEW") {
        gm.handleReviewNext(game, host);
      }

      return { code, hostId, game };
    }

    it("returns results for an ENDED game", async () => {
      const { code, hostId } = setupEndedGame();

      const res = await request(app)
        .get(`/api/games/${code}/results?playerId=${hostId}`)
        .expect(200);

      expect(res.body.gameCode).toBe(code);
      expect(res.body.chains).toHaveLength(4);
      expect(res.body.players).toHaveLength(4);
    });

    it("returns results for a REVIEW game", async () => {
      const { game, hostPlayer } = gm.createGame("Host");
      const code = game.code;
      const hostId = hostPlayer.id;

      for (let i = 1; i < 4; i++) {
        gm.joinGame(code, `Player${i}`);
      }
      game.players.forEach((p) => (p.isConnected = true));
      gm.startGame(game, game.players[0]);

      // Complete all rounds to reach REVIEW
      for (let round = 0; round < game.totalRounds; round++) {
        for (const p of game.players) {
          if (game.state === "DRAWING") {
            gm.handleSubmission(
              game,
              p,
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
            );
          } else {
            gm.handleSubmission(game, p, `content`);
          }
        }
        vi.advanceTimersByTime(3100);
      }

      expect(game.state).toBe("REVIEW");

      const res = await request(app)
        .get(`/api/games/${code}/results?playerId=${hostId}`)
        .expect(200);

      expect(res.body.chains).toHaveLength(4);
    });

    it("rejects when missing playerId", async () => {
      const { code } = setupEndedGame();

      const res = await request(app)
        .get(`/api/games/${code}/results`)
        .expect(400);

      expect(res.body.code).toBe("MISSING_PLAYER_ID");
    });

    it("rejects when playerId is not a participant", async () => {
      const { code } = setupEndedGame();

      const res = await request(app)
        .get(`/api/games/${code}/results?playerId=fake-player-id`)
        .expect(403);

      expect(res.body.code).toBe("NOT_A_PLAYER");
    });

    it("rejects when game is not finished (LOBBY state)", async () => {
      const { game, hostPlayer } = gm.createGame("Host");

      const res = await request(app)
        .get(`/api/games/${game.code}/results?playerId=${hostPlayer.id}`)
        .expect(409);

      expect(res.body.code).toBe("GAME_NOT_FINISHED");
    });

    it("returns 404 for non-existent game", async () => {
      const res = await request(app)
        .get("/api/games/ZZZZ/results?playerId=whatever")
        .expect(404);

      expect(res.body.code).toBe("GAME_NOT_FOUND");
    });
  });

  // --------------- Health check ---------------

  describe("GET /api/health", () => {
    it("returns health status", async () => {
      const res = await request(app).get("/api/health").expect(200);

      expect(res.body.status).toBe("ok");
      expect(typeof res.body.uptime).toBe("number");
      expect(typeof res.body.activeGames).toBe("number");
    });
  });
});
