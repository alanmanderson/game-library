import { Router } from "express";
import type { Request, Response } from "express";
import { GameManager, GameError } from "../game/GameManager.js";
import {
  validateBody,
  validateGameCode,
  createGameSchema,
  joinGameSchema,
} from "../middleware/validation.js";
import {
  createGameLimiter,
  joinGameLimiter,
  getGameLimiter,
  getResultsLimiter,
} from "../middleware/rateLimiter.js";
import { config } from "../config.js";

export function createGameRoutes(gameManager: GameManager): Router {
  const router = Router();

  // POST /api/games - Create a game
  router.post(
    "/",
    createGameLimiter,
    validateBody(createGameSchema),
    (req: Request, res: Response) => {
      try {
        const { hostDisplayName, settings } = req.body as {
          hostDisplayName: string;
          settings?: Record<string, unknown>;
        };

        const { game, hostPlayer } = gameManager.createGame(
          hostDisplayName,
          settings as any
        );

        res.status(201).json({
          gameCode: game.code,
          gameId: game.id,
          playerId: hostPlayer.id,
          reconnectionToken: hostPlayer.reconnectionToken,
          settings: game.settings,
        });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  // POST /api/games/:code/join - Join a game
  router.post(
    "/:code/join",
    joinGameLimiter,
    validateGameCode,
    validateBody(joinGameSchema),
    (req: Request, res: Response) => {
      try {
        const code = req.params.code;
        const { displayName } = req.body as { displayName: string };

        const { game, player } = gameManager.joinGame(code, displayName);

        res.status(200).json({
          gameCode: game.code,
          gameId: game.id,
          playerId: player.id,
          reconnectionToken: player.reconnectionToken,
          gameState: game.state,
          players: game.players.map((p) => ({
            id: p.id,
            displayName: p.displayName,
            isHost: p.isHost,
            isConnected: p.isConnected,
          })),
          settings: game.settings,
        });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  // GET /api/games/:code - Get game status
  router.get(
    "/:code",
    getGameLimiter,
    validateGameCode,
    (req: Request, res: Response) => {
      try {
        const code = req.params.code;
        const game = gameManager.getStore().getByCode(code);

        if (!game) {
          res.status(404).json({
            code: "GAME_NOT_FOUND",
            message: "Game not found. Check your code and try again.",
          });
          return;
        }

        res.status(200).json({
          gameCode: game.code,
          state: game.state,
          playerCount: game.players.length,
          maxPlayers: config.maxPlayers,
          canJoin: game.state === "LOBBY" && game.players.length < config.maxPlayers,
        });
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  // GET /api/games/:code/results - Download results
  router.get(
    "/:code/results",
    getResultsLimiter,
    validateGameCode,
    (req: Request, res: Response) => {
      try {
        const code = req.params.code;
        const playerId = req.query.playerId as string | undefined;

        if (!playerId) {
          res.status(400).json({
            code: "MISSING_PLAYER_ID",
            message: "playerId query parameter is required.",
          });
          return;
        }

        const game = gameManager.getStore().getByCode(code);
        if (!game) {
          res.status(404).json({
            code: "GAME_NOT_FOUND",
            message: "Game not found.",
          });
          return;
        }

        if (game.state !== "REVIEW" && game.state !== "ENDED") {
          res.status(409).json({
            code: "GAME_NOT_FINISHED",
            message: "Results are not available yet.",
          });
          return;
        }

        const isPlayer = game.players.some((p) => p.id === playerId);
        if (!isPlayer) {
          res.status(403).json({
            code: "NOT_A_PLAYER",
            message: "You are not a participant in this game.",
          });
          return;
        }

        const results = gameManager.getResults(game);
        res.status(200).json(results);
      } catch (err) {
        handleError(err, res);
      }
    }
  );

  return router;
}

function handleError(err: unknown, res: Response): void {
  if (err instanceof GameError) {
    res.status(err.httpStatus).json({
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  console.error("Unhandled error in REST handler:", err);
  res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred. Please try again.",
  });
}
