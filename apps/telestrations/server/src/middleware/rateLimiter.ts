import rateLimit from "express-rate-limit";
import { config } from "../config.js";

function rateLimitResponse(retryAfterMs: number) {
  return {
    code: "RATE_LIMITED",
    message: "Too many requests. Please try again later.",
    retryAfterMs,
  };
}

export const createGameLimiter = rateLimit({
  windowMs: config.createGameRateLimit.windowMs,
  max: config.createGameRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse(config.createGameRateLimit.windowMs),
  keyGenerator: (req) => req.ip || "unknown",
});

export const joinGameLimiter = rateLimit({
  windowMs: config.joinGameRateLimit.windowMs,
  max: config.joinGameRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse(config.joinGameRateLimit.windowMs),
  keyGenerator: (req) => req.ip || "unknown",
});

export const getGameLimiter = rateLimit({
  windowMs: config.getGameRateLimit.windowMs,
  max: config.getGameRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse(config.getGameRateLimit.windowMs),
  keyGenerator: (req) => req.ip || "unknown",
});

export const getResultsLimiter = rateLimit({
  windowMs: config.getResultsRateLimit.windowMs,
  max: config.getResultsRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse(config.getResultsRateLimit.windowMs),
  keyGenerator: (req) => req.ip || "unknown",
});
