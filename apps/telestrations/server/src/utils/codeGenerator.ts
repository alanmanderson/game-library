import crypto from "node:crypto";
import { config } from "../config.js";

const { codeAlphabet, codeLength } = config;

/**
 * Generate a random game code from the 22-letter alphabet (excluding I, O, L).
 * Uses crypto.randomInt for uniform randomness.
 */
export function generateGameCode(): string {
  let code = "";
  for (let i = 0; i < codeLength; i++) {
    const idx = crypto.randomInt(codeAlphabet.length);
    code += codeAlphabet[idx];
  }
  return code;
}

/**
 * Generate a unique game code that is not currently in use.
 * Accepts a predicate that checks whether a code is already taken.
 * Gives up after 100 attempts (astronomically unlikely with 234K possibilities).
 */
export function generateUniqueGameCode(isCodeInUse: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const code = generateGameCode();
    if (!isCodeInUse(code)) {
      return code;
    }
  }
  throw new Error("Failed to generate a unique game code after 100 attempts");
}
