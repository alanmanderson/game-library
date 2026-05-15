import type { Game, Chain, ChainEntry, ChainEntryType } from "../models/types.js";
import { getRoundType } from "./StateMachine.js";

/**
 * Determines which chain a player works on in a given round.
 *
 * Player P in round R works on chain (P - R + N) % N.
 * This ensures:
 * - Round 0: player P works on chain P (their own -- they write the initial prompt).
 * - Each subsequent round, chains rotate so no player sees their own chain.
 * - By the final round, every player has contributed to every chain exactly once.
 */
export function getChainIndexForPlayer(
  playerOrderIndex: number,
  round: number,
  totalPlayers: number
): number {
  return ((playerOrderIndex - round) % totalPlayers + totalPlayers) % totalPlayers;
}

/**
 * Returns what the player should receive as input for the current round.
 * - PROMPT: nothing (they write their own)
 * - DRAWING: the text from the last entry in their assigned chain
 * - GUESSING: the drawing from the last entry in their assigned chain
 */
export function getInputForPlayer(
  game: Game,
  playerOrderIndex: number,
  round: number
): { prompt?: string; promptAuthorDisplayName?: string; drawing?: string; drawingAuthorDisplayName?: string } {
  if (round === 0) {
    return {}; // Prompt phase -- no input
  }

  const chainIndex = getChainIndexForPlayer(playerOrderIndex, round, game.players.length);
  const chain = game.chains[chainIndex];

  if (!chain || chain.entries.length === 0) {
    return {};
  }

  const lastEntry = chain.entries[chain.entries.length - 1];

  if (lastEntry.type === "PROMPT" || lastEntry.type === "GUESS") {
    return {
      prompt: lastEntry.content,
      promptAuthorDisplayName: lastEntry.playerDisplayName,
    };
  } else {
    return {
      drawing: lastEntry.content,
      drawingAuthorDisplayName: lastEntry.playerDisplayName,
    };
  }
}

/**
 * Initialize empty chains for all players at game start.
 * One chain per player, keyed by their orderIndex.
 */
export function initializeChains(playerCount: number): Chain[] {
  const chains: Chain[] = [];
  for (let i = 0; i < playerCount; i++) {
    chains.push({
      originPlayerIndex: i,
      entries: [],
    });
  }
  return chains;
}

/**
 * Add an entry to the appropriate chain for a player in a given round.
 */
export function addEntryToChain(
  game: Game,
  playerOrderIndex: number,
  round: number,
  entry: ChainEntry
): void {
  const chainIndex = getChainIndexForPlayer(playerOrderIndex, round, game.players.length);
  const chain = game.chains[chainIndex];
  if (!chain) {
    throw new Error(`Chain ${chainIndex} not found`);
  }
  chain.entries.push(entry);
}

/**
 * Determine the entry type for a given round.
 */
export function getEntryTypeForRound(round: number): ChainEntryType {
  const roundType = getRoundType(round);
  switch (roundType) {
    case "PROMPT": return "PROMPT";
    case "DRAWING": return "DRAWING";
    case "GUESSING": return "GUESS";
  }
}
