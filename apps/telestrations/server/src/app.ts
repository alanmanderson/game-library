import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGameRoutes } from "./routes/games.js";
import { GameManager } from "./game/GameManager.js";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(gameManager: GameManager): express.Application {
  const app = express();

  // -- Middleware --

  // Trust proxy for rate limiting behind reverse proxy (Azure App Service)
  app.set("trust proxy", 1);

  // CORS
  app.use(
    cors({
      origin: config.allowedOrigin === "*" ? true : config.allowedOrigin,
      methods: ["GET", "POST"],
      credentials: false,
    })
  );

  // Body parser with size limit
  app.use(express.json({ limit: config.maxRequestBodySize }));

  // -- Health check (not behind /api/games prefix) --
  app.get("/api/health", (_req, res) => {
    const store = gameManager.getStore();
    res.status(200).json({
      status: "ok",
      uptime: Math.floor(process.uptime()),
      activeGames: store.size(),
      activePlayers: store.totalConnectedPlayers(),
      memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  });

  // -- API routes --
  app.use("/api/games", createGameRoutes(gameManager));

  // -- Static files (production) --
  const clientDistPath = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDistPath));

  // SPA fallback: serve index.html for any non-API route
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"), (err) => {
      if (err) {
        // If client/dist doesn't exist yet (e.g., dev), return a simple message
        res.status(200).send("Telestrations server is running. Client not built yet.");
      }
    });
  });

  // -- Error handler --
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error("Unhandled Express error:", err);
      res.status(500).json({
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again.",
      });
    }
  );

  return app;
}
