import type { Socket } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from "../models/types.js";
import { GameManager, GameError } from "../game/GameManager.js";

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Socket.IO authentication middleware.
 *
 * Validates the auth credentials on connection and associates
 * the socket with a game and player.
 */
export function createAuthMiddleware(gameManager: GameManager) {
  return (socket: TypedSocket, next: (err?: Error) => void) => {
    try {
      const { gameCode, playerId, reconnectionToken } = socket.handshake.auth as {
        gameCode?: string;
        playerId?: string;
        reconnectionToken?: string;
      };

      if (!gameCode || !playerId || !reconnectionToken) {
        return next(new Error("INVALID_CREDENTIALS: Missing or invalid authentication data"));
      }

      // Validate credentials through GameManager
      const { game, player } = gameManager.handlePlayerConnect(
        gameCode,
        playerId,
        reconnectionToken,
        socket.id
      );

      // Attach metadata to socket
      socket.data.gameCode = game.code;
      socket.data.playerId = player.id;
      socket.data.gameId = game.id;

      next();
    } catch (err) {
      if (err instanceof GameError) {
        return next(new Error(`${err.code}: ${err.message}`));
      }
      return next(new Error("INTERNAL_ERROR: An unexpected error occurred"));
    }
  };
}

/**
 * Per-socket event rate limiting.
 *
 * Tracks event counts per socket using sliding windows.
 * Returns a function that checks whether an event should be rate-limited.
 */
export class SocketRateLimiter {
  private eventCounts: Map<string, Map<string, { count: number; resetAt: number }>> = new Map();

  private limits: Record<string, { windowMs: number; max: number }> = {
    "round:submit": { windowMs: 10000, max: 5 },
    "game:settings": { windowMs: 5000, max: 3 },
    "review:next": { windowMs: 1000, max: 5 },
    "review:previous": { windowMs: 1000, max: 5 },
    __global__: { windowMs: 1000, max: 20 },
  };

  /**
   * Check if the event should be allowed. Returns true if allowed, false if rate-limited.
   */
  check(socketId: string, eventName: string): boolean {
    // Check global limit
    if (!this.checkLimit(socketId, "__global__")) {
      return false;
    }

    // Check event-specific limit
    const limit = this.limits[eventName];
    if (limit) {
      return this.checkLimit(socketId, eventName);
    }

    return true;
  }

  private checkLimit(socketId: string, key: string): boolean {
    const limit = this.limits[key];
    if (!limit) return true;

    if (!this.eventCounts.has(socketId)) {
      this.eventCounts.set(socketId, new Map());
    }

    const socketEvents = this.eventCounts.get(socketId)!;
    const now = Date.now();
    const entry = socketEvents.get(key);

    if (!entry || now >= entry.resetAt) {
      socketEvents.set(key, { count: 1, resetAt: now + limit.windowMs });
      return true;
    }

    entry.count++;
    if (entry.count > limit.max) {
      return false;
    }

    return true;
  }

  /**
   * Clean up tracking data for a disconnected socket.
   */
  cleanup(socketId: string): void {
    this.eventCounts.delete(socketId);
  }
}
