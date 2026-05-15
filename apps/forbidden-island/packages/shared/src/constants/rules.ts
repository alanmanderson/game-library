import type { Difficulty } from '../types/game.js';

/** Water meter levels from pieces-status.jsx. */
export const WATER_LEVELS: readonly { level: number; draw: number; skull?: boolean }[] = [
  { level: 1, draw: 2 },
  { level: 2, draw: 2 },
  { level: 3, draw: 3 },
  { level: 4, draw: 3 },
  { level: 5, draw: 4 },
  { level: 6, draw: 4 },
  { level: 7, draw: 5 },
  { level: 8, draw: 5 },
  { level: 9, draw: 0, skull: true },
];

/** Returns flood cards drawn per turn for a given water level. */
export function getFloodCardsForLevel(waterLevel: number): number {
  const entry = WATER_LEVELS.find((w) => w.level === waterLevel);
  return entry?.draw ?? 0;
}

/** Difficulty -> starting water level. */
export const DIFFICULTY_STARTING_LEVEL: Readonly<Record<Difficulty, number>> = {
  novice: 1,
  normal: 2,
  elite: 3,
  legendary: 4,
};

export const MAX_HAND_SIZE = 5;
export const ACTIONS_PER_TURN = 3;
export const INITIAL_FLOOD_COUNT = 6;
export const INITIAL_HAND_SIZE = 2;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const WATER_METER_MAX = 9;
export const TREASURE_CARDS_TO_CAPTURE = 4;
export const TREASURE_CARDS_PER_TURN = 2;
export const DISCONNECT_TIMEOUT_MS = 60_000;
export const GAME_GC_TIMEOUT_MS = 600_000;
