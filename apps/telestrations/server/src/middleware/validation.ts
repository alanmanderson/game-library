import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import { sanitizeHtml } from "../utils/sanitize.js";

// --------------- Schemas ---------------

export const displayNameSchema = z
  .string()
  .trim()
  .min(config.minDisplayNameLength, `Display name must be at least ${config.minDisplayNameLength} characters`)
  .max(config.maxDisplayNameLength, `Display name must be at most ${config.maxDisplayNameLength} characters`)
  .regex(config.displayNameRegex, "Display name can only contain letters, numbers, and spaces");

const VALID_CODE_CHARS = config.codeAlphabet;

export const gameCodeSchema = z
  .string()
  .transform((s) => s.toUpperCase())
  .refine(
    (s) => s.length === 4 && [...s].every((c) => VALID_CODE_CHARS.includes(c)),
    "Game code must be exactly 4 letters (excluding I, O, L)"
  );

export const settingsSchema = z
  .object({
    drawingTimerSeconds: z
      .number()
      .refine((n) => (config.drawingTimerOptions as readonly number[]).includes(n), "Invalid drawing timer value")
      .optional(),
    guessingTimerSeconds: z
      .number()
      .refine((n) => (config.guessingTimerOptions as readonly number[]).includes(n), "Invalid guessing timer value")
      .optional(),
    promptTimerSeconds: z
      .number()
      .refine((n) => (config.promptTimerOptions as readonly number[]).includes(n), "Invalid prompt timer value")
      .optional(),
    useAllRounds: z.boolean().optional(),
    customRoundCount: z.number().int().min(2).max(19).nullable().optional(),
  })
  .optional();

export const createGameSchema = z.object({
  hostDisplayName: displayNameSchema,
  settings: settingsSchema,
});

export const joinGameSchema = z.object({
  displayName: displayNameSchema,
});

export const textContentSchema = z
  .string()
  .trim()
  .min(1, "Content cannot be empty")
  .max(config.maxPromptLength, `Content must be at most ${config.maxPromptLength} characters`)
  .transform(sanitizeHtml);

export const drawingContentSchema = z
  .string()
  .refine(
    (s) => s.startsWith("data:image/png;base64,"),
    "Drawing must be a PNG data URI"
  )
  .refine(
    (s) => {
      const base64 = s.replace("data:image/png;base64,", "");
      const sizeInBytes = Math.ceil(base64.length * 3 / 4);
      return sizeInBytes <= config.maxDrawingSizeBytes;
    },
    "Drawing must be smaller than 500KB"
  );

// --------------- Middleware factory ---------------

/**
 * Express middleware that validates the request body against a zod schema.
 * On failure, returns 400 with structured error details.
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        details: result.error.flatten(),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validates a game code from URL params.
 */
export function validateGameCode(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const result = gameCodeSchema.safeParse(req.params.code);
  if (!result.success) {
    res.status(400).json({
      code: "INVALID_GAME_CODE",
      message: "Game code must be exactly 4 letters (excluding I, O, L)",
    });
    return;
  }
  req.params.code = result.data;
  next();
}
