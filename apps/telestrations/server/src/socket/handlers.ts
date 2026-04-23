import type { Server, Socket } from "socket.io";
import { z } from "zod";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  Game,
  Player,
} from "../models/types.js";
import { GameManager, GameError } from "../game/GameManager.js";
import { SocketRateLimiter } from "./middleware.js";
import { config } from "../config.js";

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TypedIO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// --------------- Payload schemas for socket events ---------------

const reconnectSchema = z.object({
  gameCode: z.string(),
  playerId: z.string(),
  reconnectionToken: z.string(),
});

const kickSchema = z.object({
  targetPlayerId: z.string(),
});

const submitSchema = z.object({
  content: z.string().max(1_000_000), // generous max for base64 drawings
});

const socketSettingsSchema = z.object({
  drawingTimerSeconds: z
    .number()
    .refine((n) => (config.drawingTimerOptions as readonly number[]).includes(n))
    .optional(),
  guessingTimerSeconds: z
    .number()
    .refine((n) => (config.guessingTimerOptions as readonly number[]).includes(n))
    .optional(),
  promptTimerSeconds: z
    .number()
    .refine((n) => (config.promptTimerOptions as readonly number[]).includes(n))
    .optional(),
  useAllRounds: z.boolean().optional(),
  customRoundCount: z.number().int().min(2).max(19).nullable().optional(),
});

/**
 * Register all Socket.IO event handlers for a connected socket.
 */
export function registerHandlers(
  io: TypedIO,
  socket: TypedSocket,
  gameManager: GameManager,
  rateLimiter: SocketRateLimiter
): void {
  // Helper: resolve the game and player for the current socket
  function getGameAndPlayer(): { game: Game; player: Player } {
    const game = gameManager.getStore().getByCode(socket.data.gameCode);
    if (!game) {
      throw new GameError("GAME_NOT_FOUND", "Game not found or has ended.", 404);
    }
    const player = game.players.find((p) => p.id === socket.data.playerId);
    if (!player) {
      throw new GameError("PLAYER_NOT_FOUND", "Player not found in this game.", 404);
    }
    return { game, player };
  }

  // Helper: rate limit check
  function checkRate(eventName: string): boolean {
    if (!rateLimiter.check(socket.id, eventName)) {
      socket.emit("error", {
        code: "RATE_LIMITED",
        message: "Too many requests. Slow down.",
      });
      // Disconnect on global rate limit breach
      if (eventName === "__global__") {
        socket.disconnect(true);
      }
      return false;
    }
    return true;
  }

  // Helper: wrap handler with try-catch and rate limiting
  function safeHandler(eventName: string, handler: () => void): void {
    try {
      if (!checkRate(eventName)) return;
      handler();
    } catch (err) {
      if (err instanceof GameError) {
        socket.emit("error", {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        });
      } else {
        console.error(`Socket handler error [${eventName}]:`, err);
        socket.emit("error", {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
        });
      }
    }
  }

  // -- On successful connection: join room and emit full state --
  socket.join(socket.data.gameCode);

  // Send full state to the connecting client
  {
    const game = gameManager.getStore().getByCode(socket.data.gameCode);
    const player = game?.players.find((p) => p.id === socket.data.playerId);
    if (game && player) {
      socket.emit("game:state", gameManager.buildGameStatePayload(game, player));

      // Notify others
      socket.to(game.code).emit("game:player-joined", {
        player: {
          id: player.id,
          displayName: player.displayName,
          isHost: player.isHost,
          isConnected: true,
        },
        isReconnect: false,
        playerCount: game.players.filter((p) => p.isConnected).length,
      });
    }
  }

  // -- player:reconnect --
  socket.on("player:reconnect", (data: unknown) => {
    safeHandler("player:reconnect", () => {
      const parsed = reconnectSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit("error", {
          code: "VALIDATION_ERROR",
          message: "Invalid reconnect data",
          details: parsed.error.flatten(),
        });
        return;
      }

      const { gameCode, playerId, reconnectionToken } = parsed.data;

      try {
        const { game, player } = gameManager.handlePlayerConnect(
          gameCode,
          playerId,
          reconnectionToken,
          socket.id
        );

        socket.data.gameCode = game.code;
        socket.data.playerId = player.id;
        socket.data.gameId = game.id;

        socket.join(game.code);
        socket.emit("game:state", gameManager.buildGameStatePayload(game, player));

        socket.to(game.code).emit("game:player-joined", {
          player: {
            id: player.id,
            displayName: player.displayName,
            isHost: player.isHost,
            isConnected: true,
          },
          isReconnect: true,
          playerCount: game.players.filter((p) => p.isConnected).length,
        });
      } catch (err) {
        if (err instanceof GameError) {
          socket.emit("error", { code: err.code, message: err.message });
        } else {
          throw err;
        }
      }
    });
  });

  // -- player:leave --
  socket.on("player:leave", () => {
    safeHandler("player:leave", () => {
      const { game, player } = getGameAndPlayer();
      socket.leave(game.code);
      gameManager.handlePlayerLeave(game, player);
    });
  });

  // -- game:start --
  socket.on("game:start", () => {
    safeHandler("game:start", () => {
      const { game, player } = getGameAndPlayer();
      gameManager.startGame(game, player);
    });
  });

  // -- game:settings --
  socket.on("game:settings", (data: unknown) => {
    safeHandler("game:settings", () => {
      const parsed = socketSettingsSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit("error", {
          code: "INVALID_SETTINGS",
          message: "Invalid settings values",
          details: parsed.error.flatten(),
        });
        return;
      }

      const { game, player } = getGameAndPlayer();
      gameManager.handleSettingsUpdate(game, player, parsed.data as any);

      // Broadcast updated state to all players
      for (const p of game.players) {
        if (p.socketId) {
          const s = io.sockets.sockets.get(p.socketId);
          if (s) {
            s.emit("game:state", gameManager.buildGameStatePayload(game, p));
          }
        }
      }
    });
  });

  // -- game:kick --
  socket.on("game:kick", (data: unknown) => {
    safeHandler("game:kick", () => {
      const parsed = kickSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit("error", {
          code: "VALIDATION_ERROR",
          message: "Invalid kick data",
          details: parsed.error.flatten(),
        });
        return;
      }

      const { game, player } = getGameAndPlayer();
      gameManager.handleKick(game, player, parsed.data.targetPlayerId);
    });
  });

  // -- round:submit --
  socket.on("round:submit", (data: unknown) => {
    safeHandler("round:submit", () => {
      const parsed = submitSchema.safeParse(data);
      if (!parsed.success) {
        socket.emit("error", {
          code: "INVALID_CONTENT",
          message: "Invalid submission content",
          details: parsed.error.flatten(),
        });
        return;
      }

      const { game, player } = getGameAndPlayer();
      gameManager.handleSubmission(game, player, parsed.data.content);
    });
  });

  // -- round:end-early --
  socket.on("round:end-early", () => {
    safeHandler("round:end-early", () => {
      const { game, player } = getGameAndPlayer();
      gameManager.handleEndEarly(game, player);
    });
  });

  // -- review:next-entry --
  socket.on("review:next-entry", () => {
    safeHandler("review:next-entry", () => {
      const { game, player } = getGameAndPlayer();
      gameManager.handleReviewNextEntry(game, player);
    });
  });

  // -- review:prev-entry --
  socket.on("review:prev-entry", () => {
    safeHandler("review:prev-entry", () => {
      const { game, player } = getGameAndPlayer();
      gameManager.handleReviewPrevEntry(game, player);
    });
  });

  // -- review:next-chain --
  socket.on("review:next-chain", () => {
    safeHandler("review:next-chain", () => {
      const { game, player } = getGameAndPlayer();
      gameManager.handleReviewNextChain(game, player);
    });
  });

  // -- review:prev-chain --
  socket.on("review:prev-chain", () => {
    safeHandler("review:prev-chain", () => {
      const { game, player } = getGameAndPlayer();
      gameManager.handleReviewPrevChain(game, player);
    });
  });

  // -- game:play-again --
  socket.on("game:play-again", () => {
    safeHandler("game:play-again", () => {
      const { game, player } = getGameAndPlayer();
      gameManager.handlePlayAgain(game, player);
    });
  });

  // -- disconnect --
  socket.on("disconnect", () => {
    rateLimiter.cleanup(socket.id);
    gameManager.handlePlayerDisconnect(socket.id);
  });
}
