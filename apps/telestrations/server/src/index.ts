import http from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { GameManager } from "./game/GameManager.js";
import { GameStore } from "./game/GameStore.js";
import { TimerService } from "./game/TimerService.js";
import { createAuthMiddleware, SocketRateLimiter } from "./socket/middleware.js";
import { registerHandlers } from "./socket/handlers.js";
import { config } from "./config.js";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from "./models/types.js";

// -- Bootstrap --

const store = new GameStore();
const timers = new TimerService();
const gameManager = new GameManager(store, timers);

const app = createApp(gameManager);
const httpServer = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  {
    cors: {
      origin: config.allowedOrigin === "*" ? true : config.allowedOrigin,
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: config.maxHttpBufferSize,
    pingInterval: 10000,
    pingTimeout: 30000,
  }
);

// Wire IO into GameManager so it can broadcast events
gameManager.setIO(io);

// Socket.IO authentication middleware
const authMiddleware = createAuthMiddleware(gameManager);
io.use(authMiddleware);

// Socket.IO rate limiter (shared across all sockets)
const socketRateLimiter = new SocketRateLimiter();

// Connection handler
io.on("connection", (socket) => {
  registerHandlers(io, socket, gameManager, socketRateLimiter);
});

// Start periodic cleanup sweep
gameManager.startPeriodicSweep();

// -- Start server --

httpServer.listen(config.port, () => {
  console.log(
    JSON.stringify({
      level: "info",
      message: "Server started",
      port: config.port,
      env: config.nodeEnv,
      timestamp: new Date().toISOString(),
    })
  );
});

// -- Graceful shutdown --

function shutdown(signal: string): void {
  console.log(
    JSON.stringify({
      level: "info",
      message: `${signal} received, starting graceful shutdown`,
      timestamp: new Date().toISOString(),
    })
  );

  gameManager.stopPeriodicSweep();

  io.emit("error", {
    code: "SERVER_SHUTTING_DOWN",
    message: "Server is restarting. Your game state may be lost.",
  });

  httpServer.close(() => {
    console.log(
      JSON.stringify({
        level: "info",
        message: "HTTP server closed",
        timestamp: new Date().toISOString(),
      })
    );
    process.exit(0);
  });

  // Force shutdown after 5 seconds
  setTimeout(() => {
    console.log(
      JSON.stringify({
        level: "warn",
        message: "Forced shutdown after timeout",
        timestamp: new Date().toISOString(),
      })
    );
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { httpServer, io, gameManager };
