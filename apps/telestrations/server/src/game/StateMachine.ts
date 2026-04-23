import type { Game, GameState } from "../models/types.js";
import { config } from "../config.js";

/**
 * Determines the type of a round given its 0-based index.
 * Round 0 is always PROMPT. After that, odd rounds are DRAWING, even rounds are GUESSING.
 */
export function getRoundType(round: number): "PROMPT" | "DRAWING" | "GUESSING" {
  if (round === 0) return "PROMPT";
  return round % 2 === 1 ? "DRAWING" : "GUESSING";
}

/**
 * Determines whether the game has more rounds remaining after the current one.
 */
export function hasMoreRounds(game: Game): boolean {
  return game.currentRound < game.totalRounds - 1;
}

/**
 * Determines the next state after the current round completes.
 */
export function getNextStateAfterRound(game: Game): GameState {
  if (!hasMoreRounds(game)) {
    return "REVIEW";
  }
  const nextRound = game.currentRound + 1;
  return getRoundType(nextRound) === "DRAWING" ? "DRAWING" : "GUESSING";
}

export interface TransitionResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate whether a state transition is allowed.
 * This is the central guard that prevents invalid game states.
 */
export function canTransition(
  game: Game,
  from: GameState,
  to: GameState,
  context?: { senderId?: string; allSubmitted?: boolean; timerExpired?: boolean }
): TransitionResult {
  if (game.state !== from) {
    return { valid: false, error: `Game is in ${game.state}, not ${from}` };
  }

  switch (`${from}->${to}`) {
    case "LOBBY->PROMPT": {
      // Must be host
      if (context?.senderId && context.senderId !== game.hostPlayerId) {
        return { valid: false, error: "Only the host can start the game" };
      }
      // Need at least 4 connected players
      const connectedCount = game.players.filter(p => p.isConnected).length;
      if (connectedCount < config.minPlayers) {
        return { valid: false, error: `Need at least ${config.minPlayers} connected players` };
      }
      return { valid: true };
    }

    case "PROMPT->DRAWING":
    case "DRAWING->GUESSING":
    case "GUESSING->DRAWING": {
      // All submitted or timer expired
      if (!context?.allSubmitted && !context?.timerExpired) {
        return { valid: false, error: "Not all players submitted and timer has not expired" };
      }
      // Must have more rounds
      if (!hasMoreRounds(game)) {
        return { valid: false, error: "No more rounds remaining" };
      }
      return { valid: true };
    }

    case "PROMPT->REVIEW":
    case "DRAWING->REVIEW":
    case "GUESSING->REVIEW": {
      // All submitted or timer expired
      if (!context?.allSubmitted && !context?.timerExpired) {
        return { valid: false, error: "Not all players submitted and timer has not expired" };
      }
      // Must be the final round
      if (hasMoreRounds(game)) {
        return { valid: false, error: "More rounds remain; cannot go to review yet" };
      }
      return { valid: true };
    }

    case "REVIEW->ENDED": {
      return { valid: true };
    }

    default:
      return { valid: false, error: `Invalid transition from ${from} to ${to}` };
  }
}

/**
 * Apply a state transition. Throws if the transition is invalid.
 * Mutates the game in place and returns it.
 */
export function transition(
  game: Game,
  to: GameState,
  context?: { senderId?: string; allSubmitted?: boolean; timerExpired?: boolean }
): Game {
  const result = canTransition(game, game.state, to, context);
  if (!result.valid) {
    throw new Error(result.error);
  }
  game.state = to;
  return game;
}
