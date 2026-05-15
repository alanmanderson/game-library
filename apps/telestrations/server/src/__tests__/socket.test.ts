import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import http from "node:http";
import { Server } from "socket.io";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import express from "express";
import { GameManager } from "../game/GameManager.js";
import { GameStore } from "../game/GameStore.js";
import { TimerService } from "../game/TimerService.js";
import { createAuthMiddleware, SocketRateLimiter } from "../socket/middleware.js";
import { registerHandlers } from "../socket/handlers.js";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from "../models/types.js";

type TypedClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

describe("Socket.IO integration", () => {
  let httpServer: http.Server;
  let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  let gm: GameManager;
  let store: GameStore;
  let timers: TimerService;
  let port: number;
  let clientSockets: TypedClientSocket[];
  let rateLimiter: SocketRateLimiter;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        store = new GameStore();
        timers = new TimerService();
        gm = new GameManager(store, timers);

        const app = express();
        app.use(express.json());
        httpServer = http.createServer(app);

        io = new Server(httpServer, {
          cors: { origin: "*" },
        });

        gm.setIO(io);

        const authMiddleware = createAuthMiddleware(gm);
        io.use(authMiddleware);

        rateLimiter = new SocketRateLimiter();

        io.on("connection", (socket) => {
          registerHandlers(io, socket, gm, rateLimiter);
        });

        httpServer.listen(0, () => {
          const address = httpServer.address();
          if (address && typeof address === "object") {
            port = address.port;
          }
          resolve();
        });
      })
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        io.close();
        httpServer.close(() => resolve());
      })
  );

  beforeEach(() => {
    clientSockets = [];
  });

  afterEach(async () => {
    // Disconnect all client sockets
    for (const s of clientSockets) {
      if (s.connected) {
        s.disconnect();
      }
    }
    clientSockets = [];

    // Clean up all games from the store
    for (const game of store.getAll()) {
      timers.clearAll(game.id);
      store.delete(game.id);
    }
  });

  function connectClient(auth: {
    gameCode: string;
    playerId: string;
    reconnectionToken: string;
  }): TypedClientSocket {
    const socket = ioClient(`http://localhost:${port}`, {
      auth,
      transports: ["websocket"],
      forceNew: true,
    }) as TypedClientSocket;
    clientSockets.push(socket);
    return socket;
  }

  function waitForEvent<T>(
    socket: TypedClientSocket,
    event: string,
    timeoutMs = 5000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event "${event}"`));
      }, timeoutMs);

      (socket as any).once(event, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  function createGameAndConnect(playerCount: number): Promise<{
    game: ReturnType<typeof gm.createGame>["game"];
    sockets: TypedClientSocket[];
    players: ReturnType<typeof gm.createGame>["hostPlayer"][];
  }> {
    return new Promise(async (resolve) => {
      const { game, hostPlayer } = gm.createGame("Host");
      const players = [hostPlayer];
      const sockets: TypedClientSocket[] = [];

      // Connect host
      const hostSocket = connectClient({
        gameCode: game.code,
        playerId: hostPlayer.id,
        reconnectionToken: hostPlayer.reconnectionToken,
      });
      sockets.push(hostSocket);
      await waitForEvent(hostSocket, "game:state");

      // Add and connect additional players
      for (let i = 1; i < playerCount; i++) {
        const { player } = gm.joinGame(game.code, `Player${i}`);
        players.push(player);

        const socket = connectClient({
          gameCode: game.code,
          playerId: player.id,
          reconnectionToken: player.reconnectionToken,
        });
        sockets.push(socket);
        await waitForEvent(socket, "game:state");
      }

      resolve({ game, sockets, players });
    });
  }

  // --------------- Connection ---------------

  describe("connection", () => {
    it("connects and receives game:state", async () => {
      const { game, hostPlayer } = gm.createGame("Alice");

      const socket = connectClient({
        gameCode: game.code,
        playerId: hostPlayer.id,
        reconnectionToken: hostPlayer.reconnectionToken,
      });

      const state = await waitForEvent<any>(socket, "game:state");
      expect(state.gameCode).toBe(game.code);
      expect(state.state).toBe("LOBBY");
      expect(state.players).toHaveLength(1);
    });

    it("rejects connection with invalid credentials", async () => {
      const socket = connectClient({
        gameCode: "ZZZZ",
        playerId: "fake",
        reconnectionToken: "fake",
      });

      const error = await new Promise<Error>((resolve) => {
        socket.on("connect_error", (err) => resolve(err));
      });

      expect(error.message).toContain("GAME_NOT_FOUND");
    });

    it("rejects connection with invalid token", async () => {
      const { game, hostPlayer } = gm.createGame("Alice");

      const socket = connectClient({
        gameCode: game.code,
        playerId: hostPlayer.id,
        reconnectionToken: "wrong-token",
      });

      const error = await new Promise<Error>((resolve) => {
        socket.on("connect_error", (err) => resolve(err));
      });

      expect(error.message).toContain("INVALID_TOKEN");
    });
  });

  // --------------- Player joined broadcast ---------------

  describe("player join broadcast", () => {
    it("broadcasts game:player-joined when a player connects", async () => {
      const { game, hostPlayer } = gm.createGame("Alice");

      const hostSocket = connectClient({
        gameCode: game.code,
        playerId: hostPlayer.id,
        reconnectionToken: hostPlayer.reconnectionToken,
      });
      await waitForEvent(hostSocket, "game:state");

      // Create and connect a second player
      const { player: bob } = gm.joinGame(game.code, "Bob");

      const joinedPromise = waitForEvent<any>(hostSocket, "game:player-joined");

      const bobSocket = connectClient({
        gameCode: game.code,
        playerId: bob.id,
        reconnectionToken: bob.reconnectionToken,
      });
      await waitForEvent(bobSocket, "game:state");

      const joined = await joinedPromise;
      expect(joined.player.displayName).toBe("Bob");
      expect(joined.playerCount).toBe(2);
    });
  });

  // --------------- game:start ---------------

  describe("game:start", () => {
    it("host can start game and all players receive round:start", async () => {
      const { game, sockets, players } = await createGameAndConnect(4);

      // Collect round:start events from all sockets
      const roundStartPromises = sockets.map((s) =>
        waitForEvent<any>(s, "round:start")
      );

      // Host emits game:start
      sockets[0].emit("game:start");

      const roundStarts = await Promise.all(roundStartPromises);
      for (const rs of roundStarts) {
        expect(rs.round).toBe(0);
        expect(rs.type).toBe("PROMPT");
        expect(rs.timerDurationMs).toBeGreaterThan(0);
      }
    });

    it("non-host cannot start game", async () => {
      const { sockets } = await createGameAndConnect(4);

      const errorPromise = waitForEvent<any>(sockets[1], "error");
      sockets[1].emit("game:start");

      const err = await errorPromise;
      expect(err.code).toBe("NOT_HOST");
    });
  });

  // --------------- round:submit ---------------

  describe("round:submit", () => {
    it("tracks submissions and broadcasts round:player-submitted", async () => {
      const { game, sockets, players } = await createGameAndConnect(4);

      // Start the game
      const roundStartPromises = sockets.map((s) =>
        waitForEvent<any>(s, "round:start")
      );
      sockets[0].emit("game:start");
      await Promise.all(roundStartPromises);

      // Player 0 submits
      const submittedPromise = waitForEvent<any>(sockets[1], "round:player-submitted");
      sockets[0].emit("round:submit", { content: "elephant" });

      const submitted = await submittedPromise;
      expect(submitted.submittedCount).toBe(1);
      expect(submitted.totalPlayers).toBe(4);
    });

    it("all players submitting triggers round:ended", async () => {
      const { game, sockets, players } = await createGameAndConnect(4);

      // Start the game
      const roundStartPromises = sockets.map((s) =>
        waitForEvent<any>(s, "round:start")
      );
      sockets[0].emit("game:start");
      await Promise.all(roundStartPromises);

      // All 4 players submit
      const endedPromise = waitForEvent<any>(sockets[0], "round:ended");

      for (let i = 0; i < 4; i++) {
        sockets[i].emit("round:submit", { content: `prompt-${i}` });
      }

      const ended = await endedPromise;
      expect(ended.roundCompleted).toBe(0);
      expect(ended.nextType).toBe("DRAWING");
    });
  });

  // --------------- Full round cycle ---------------

  describe("full round cycle", () => {
    it("completes a round and starts the next one", async () => {
      const { game, sockets, players } = await createGameAndConnect(4);

      // Start
      const round0Promises = sockets.map((s) => waitForEvent<any>(s, "round:start"));
      sockets[0].emit("game:start");
      await Promise.all(round0Promises);

      // All submit prompts
      const endedPromise = waitForEvent<any>(sockets[0], "round:ended");
      for (let i = 0; i < 4; i++) {
        sockets[i].emit("round:submit", { content: `prompt-${i}` });
      }
      await endedPromise;

      // Wait for next round:start (after transition timer)
      const round1Promises = sockets.map((s) => waitForEvent<any>(s, "round:start"));
      const round1Starts = await Promise.all(round1Promises);

      for (const rs of round1Starts) {
        expect(rs.round).toBe(1);
        expect(rs.type).toBe("DRAWING");
        // Each player should get a prompt to draw
        expect(rs.prompt).toBeDefined();
      }
    });
  });

  // --------------- review:next-entry, review:prev-entry, review:next-chain, review:prev-chain ---------------

  describe("review navigation", () => {
    it("host can navigate review entries and all players receive review:entry", async () => {
      const { game, sockets, players } = await createGameAndConnect(4);

      // Start and play through all rounds
      const round0Promises = sockets.map((s) => waitForEvent<any>(s, "round:start"));
      sockets[0].emit("game:start");
      await Promise.all(round0Promises);

      // Complete all rounds
      for (let round = 0; round < game.totalRounds; round++) {
        const endPromise = waitForEvent<any>(sockets[0], "round:ended");

        for (let i = 0; i < 4; i++) {
          if (game.state === "DRAWING") {
            sockets[i].emit("round:submit", {
              content:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
            });
          } else {
            sockets[i].emit("round:submit", { content: `content-${round}-${i}` });
          }
        }

        await endPromise;

        // Wait for next round or review
        if (round < game.totalRounds - 1) {
          const nextRound = sockets.map((s) => waitForEvent<any>(s, "round:start"));
          await Promise.all(nextRound);
        }
      }

      // Wait for the initial review:entry (first entry of first chain, emitted after transition)
      const firstEntry = await waitForEvent<any>(sockets[0], "review:entry");
      expect(firstEntry.chainIndex).toBe(0);
      expect(firstEntry.entryIndex).toBe(0);

      // Wait a small moment for the event to be fully processed
      await new Promise((r) => setTimeout(r, 100));

      // Host navigates next entry -- set up listener BEFORE emitting
      const nextEntryPromise = waitForEvent<any>(sockets[1], "review:entry");
      sockets[0].emit("review:next-entry");
      const nextEntry = await nextEntryPromise;
      expect(nextEntry.chainIndex).toBe(0);
      expect(nextEntry.entryIndex).toBe(1);

      // Wait a moment
      await new Promise((r) => setTimeout(r, 100));

      // Host navigates previous entry
      const prevEntryPromise = waitForEvent<any>(sockets[1], "review:entry");
      sockets[0].emit("review:prev-entry");
      const prevData = await prevEntryPromise;
      expect(prevData.chainIndex).toBe(0);
      expect(prevData.entryIndex).toBe(0);
    });

    it("host can navigate between chains", async () => {
      const { game, sockets, players } = await createGameAndConnect(4);

      // Start and play through all rounds
      const round0Promises = sockets.map((s) => waitForEvent<any>(s, "round:start"));
      sockets[0].emit("game:start");
      await Promise.all(round0Promises);

      // Complete all rounds
      for (let round = 0; round < game.totalRounds; round++) {
        const endPromise = waitForEvent<any>(sockets[0], "round:ended");

        for (let i = 0; i < 4; i++) {
          if (game.state === "DRAWING") {
            sockets[i].emit("round:submit", {
              content:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
            });
          } else {
            sockets[i].emit("round:submit", { content: `content-${round}-${i}` });
          }
        }

        await endPromise;

        if (round < game.totalRounds - 1) {
          const nextRound = sockets.map((s) => waitForEvent<any>(s, "round:start"));
          await Promise.all(nextRound);
        }
      }

      // Wait for the initial review:entry
      await waitForEvent<any>(sockets[0], "review:entry");
      await new Promise((r) => setTimeout(r, 100));

      // Host jumps to next chain
      const nextChainPromise = waitForEvent<any>(sockets[1], "review:entry");
      sockets[0].emit("review:next-chain");
      const nextChainEntry = await nextChainPromise;
      expect(nextChainEntry.chainIndex).toBe(1);
      expect(nextChainEntry.entryIndex).toBe(0);

      await new Promise((r) => setTimeout(r, 100));

      // Host jumps back to previous chain
      const prevChainPromise = waitForEvent<any>(sockets[1], "review:entry");
      sockets[0].emit("review:prev-chain");
      const prevChainEntry = await prevChainPromise;
      expect(prevChainEntry.chainIndex).toBe(0);
      expect(prevChainEntry.entryIndex).toBe(0);
    });
  });

  // --------------- Disconnect ---------------

  describe("disconnect handling", () => {
    it("broadcasts game:player-left on disconnect", async () => {
      const { game, sockets, players } = await createGameAndConnect(4);

      const leftPromise = waitForEvent<any>(sockets[0], "game:player-left");

      // Disconnect player 3
      sockets[3].disconnect();

      const left = await leftPromise;
      expect(left.reason).toBe("disconnected");
      expect(left.removedFromGame).toBe(false);
    });
  });

  // --------------- Reconnection ---------------

  describe("reconnection", () => {
    it("reconnects with valid token and receives game:state", async () => {
      const { game, sockets, players } = await createGameAndConnect(4);

      const player1 = players[1];
      const token = player1.reconnectionToken;

      // Disconnect player 1
      sockets[1].disconnect();

      // Wait a bit for disconnect to register
      await new Promise((r) => setTimeout(r, 100));

      // Reconnect
      const reconnectSocket = connectClient({
        gameCode: game.code,
        playerId: player1.id,
        reconnectionToken: token,
      });

      const state = await waitForEvent<any>(reconnectSocket, "game:state");
      expect(state.gameCode).toBe(game.code);
      expect(state.state).toBe("LOBBY");
    });

    it("rejects reconnection with invalid token", async () => {
      const { game, sockets, players } = await createGameAndConnect(4);

      const player1 = players[1];
      sockets[1].disconnect();

      await new Promise((r) => setTimeout(r, 100));

      const badSocket = connectClient({
        gameCode: game.code,
        playerId: player1.id,
        reconnectionToken: "wrong-token",
      });

      const error = await new Promise<Error>((resolve) => {
        badSocket.on("connect_error", (err) => resolve(err));
      });

      expect(error.message).toContain("INVALID_TOKEN");
    });
  });
});
