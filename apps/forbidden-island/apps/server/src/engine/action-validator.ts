import type { GameState, GameAction, Player, TreasureType } from '@forbidden-island/shared';
import {
  MAX_HAND_SIZE, TREASURE_CARDS_TO_CAPTURE, TREASURE_TILES,
} from '@forbidden-island/shared';
import {
  getValidMovePositions, getValidShoreUpPositions, getValidGiveTargets,
  positionsEqual, getTileAtPosition, getNavigatorMovePositions,
  getValidSwimPositions,
} from './role-abilities.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a game action. Returns { valid: true } or { valid: false, error: '...' }.
 * Pure function, no side effects.
 */
export function validateAction(
  state: GameState,
  playerId: string,
  action: GameAction,
): ValidationResult {
  // Terminal states: no actions allowed
  if (state.phase === 'won' || state.phase === 'lost') {
    return { valid: false, error: 'Game is over.' };
  }

  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    return { valid: false, error: 'Player not found.' };
  }

  // Special cards (helicopter_lift, sandbags) can be played by ANY player at ANY time
  // during certain phases
  if (action.type === 'play_helicopter_lift' || action.type === 'play_sandbags') {
    return validateSpecialCard(state, player, action);
  }

  // Discard can happen during the discard phase by the discarding player
  if (action.type === 'discard') {
    return validateDiscard(state, player, action);
  }

  // Swim can happen during swim phase by the swimming player
  if (action.type === 'swim') {
    return validateSwim(state, player, action);
  }

  // All other actions require being the current player during the action phase
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    return { valid: false, error: 'It is not your turn.' };
  }

  if (state.phase !== 'action') {
    return { valid: false, error: `Cannot perform actions during ${state.phase} phase.` };
  }

  if (state.actionsRemaining <= 0 && action.type !== 'end_actions') {
    return { valid: false, error: 'No actions remaining.' };
  }

  switch (action.type) {
    case 'move':
      return validateMove(state, currentPlayer, action);
    case 'shore_up':
      return validateShoreUp(state, currentPlayer, action);
    case 'give_card':
      return validateGiveCard(state, currentPlayer, action);
    case 'capture_treasure':
      return validateCaptureTreasure(state, currentPlayer, action);
    case 'end_actions':
      return { valid: true };
    case 'navigator_move':
      return validateNavigatorMove(state, currentPlayer, action);
    default:
      return { valid: false, error: 'Unknown action type.' };
  }
}

function validateMove(
  state: GameState,
  player: Player,
  action: Extract<GameAction, { type: 'move' }>,
): ValidationResult {
  const validPositions = getValidMovePositions(state, player);
  const isValid = validPositions.some((p) => positionsEqual(p, action.targetPosition));

  if (!isValid) {
    return { valid: false, error: 'Invalid move destination.' };
  }
  return { valid: true };
}

function validateShoreUp(
  state: GameState,
  player: Player,
  action: Extract<GameAction, { type: 'shore_up' }>,
): ValidationResult {
  // Engineer can shore up 2 for 1 action
  if (player.role === 'engineer') {
    // If engineer has already shored up once this action, this is the free second
    if (state.engineerShoreUpCount === 1) {
      // This is the free second shore-up; don't consume an action
      // Still need to validate target
    }
    // If engineer hasn't shored up yet, or count is 0, this is the first
  }

  const validPositions = getValidShoreUpPositions(state, player);
  const isValid = validPositions.some((p) => positionsEqual(p, action.targetPosition));

  if (!isValid) {
    return { valid: false, error: 'Invalid shore up target.' };
  }
  return { valid: true };
}

function validateGiveCard(
  state: GameState,
  player: Player,
  action: Extract<GameAction, { type: 'give_card' }>,
): ValidationResult {
  // Find the card in hand
  const card = player.hand.find((c) => c.id === action.cardId);
  if (!card) {
    return { valid: false, error: 'Card not in hand.' };
  }

  // Cannot give special cards
  if (card.type === 'helicopter_lift' || card.type === 'sandbags' || card.type === 'waters_rise') {
    return { valid: false, error: 'Cannot trade special cards.' };
  }

  // Validate target player
  const validTargets = getValidGiveTargets(state, player);
  const isValidTarget = validTargets.some((p) => p.id === action.targetPlayerId);
  if (!isValidTarget) {
    return { valid: false, error: 'Invalid give target.' };
  }

  return { valid: true };
}

function validateCaptureTreasure(
  state: GameState,
  player: Player,
  action: Extract<GameAction, { type: 'capture_treasure' }>,
): ValidationResult {
  const { treasureType } = action;

  // Already captured?
  if (state.capturedTreasures.includes(treasureType)) {
    return { valid: false, error: 'Treasure already captured.' };
  }

  // Is player on a corresponding treasure tile?
  const tile = getTileAtPosition(state.tiles, player.position);
  if (!tile || tile.treasure !== treasureType) {
    return { valid: false, error: 'Not on a matching treasure tile.' };
  }

  // Does player have 4 matching treasure cards?
  const matchingCards = player.hand.filter((c) => c.type === treasureType);
  if (matchingCards.length < TREASURE_CARDS_TO_CAPTURE) {
    return { valid: false, error: `Need ${TREASURE_CARDS_TO_CAPTURE} matching cards.` };
  }

  return { valid: true };
}

function validateNavigatorMove(
  state: GameState,
  player: Player,
  action: Extract<GameAction, { type: 'navigator_move' }>,
): ValidationResult {
  if (player.role !== 'navigator') {
    return { valid: false, error: 'Only the Navigator can move other players.' };
  }

  const targetPlayer = state.players.find((p) => p.id === action.targetPlayerId);
  if (!targetPlayer) {
    return { valid: false, error: 'Target player not found.' };
  }

  if (targetPlayer.id === player.id) {
    return { valid: false, error: 'Navigator cannot use this ability on themselves.' };
  }

  // Check if we're in the middle of a navigator move sequence
  const movesUsed = state.navigatorTargetPlayerId === action.targetPlayerId
    ? 2 - state.navigatorMovesRemaining
    : 0;

  // If switching targets mid-move, that's not allowed
  if (state.navigatorTargetPlayerId && state.navigatorTargetPlayerId !== action.targetPlayerId) {
    return { valid: false, error: 'Must finish moving current player first.' };
  }

  const validPositions = getNavigatorMovePositions(
    state.tiles,
    targetPlayer.position,
    movesUsed,
  );

  const isValid = validPositions.some((p) => positionsEqual(p, action.targetPosition));
  if (!isValid) {
    return { valid: false, error: 'Invalid navigator move destination.' };
  }

  return { valid: true };
}

function validateSpecialCard(
  state: GameState,
  player: Player,
  action: Extract<GameAction, { type: 'play_helicopter_lift' | 'play_sandbags' }>,
): ValidationResult {
  // Special cards can be played during action, draw_treasure, draw_flood, discard phases
  const allowedPhases = ['action', 'draw_treasure', 'draw_flood', 'discard', 'swim'];
  if (!allowedPhases.includes(state.phase)) {
    return { valid: false, error: 'Cannot play special cards during this phase.' };
  }

  if (action.type === 'play_helicopter_lift') {
    const card = player.hand.find((c) => c.id === action.cardId && c.type === 'helicopter_lift');
    if (!card) {
      return { valid: false, error: 'Helicopter Lift card not in hand.' };
    }

    // All specified players must be on the same tile
    const movingPlayers = state.players.filter((p) => action.playerIds.includes(p.id));
    if (movingPlayers.length === 0) {
      return { valid: false, error: 'No players specified to move.' };
    }

    const firstPos = movingPlayers[0].position;
    const allSameTile = movingPlayers.every((p) => positionsEqual(p.position, firstPos));
    if (!allSameTile) {
      return { valid: false, error: 'All moved players must be on the same tile.' };
    }

    // Destination must be a non-sunk tile
    const destTile = getTileAtPosition(state.tiles, action.targetPosition);
    if (!destTile || destTile.state === 'sunk') {
      return { valid: false, error: 'Invalid helicopter destination.' };
    }

    return { valid: true };
  }

  if (action.type === 'play_sandbags') {
    const card = player.hand.find((c) => c.id === action.cardId && c.type === 'sandbags');
    if (!card) {
      return { valid: false, error: 'Sandbags card not in hand.' };
    }

    // Target must be a flooded tile
    const tile = getTileAtPosition(state.tiles, action.targetPosition);
    if (!tile || tile.state !== 'flooded') {
      return { valid: false, error: 'Target tile is not flooded.' };
    }

    return { valid: true };
  }

  return { valid: false, error: 'Unknown special card type.' };
}

function validateDiscard(
  state: GameState,
  player: Player,
  action: Extract<GameAction, { type: 'discard' }>,
): ValidationResult {
  if (state.phase !== 'discard') {
    return { valid: false, error: 'Not in discard phase.' };
  }

  if (state.discardingPlayerId !== player.id) {
    return { valid: false, error: 'It is not your turn to discard.' };
  }

  const card = player.hand.find((c) => c.id === action.cardId);
  if (!card) {
    return { valid: false, error: 'Card not in hand.' };
  }

  return { valid: true };
}

function validateSwim(
  state: GameState,
  player: Player,
  action: Extract<GameAction, { type: 'swim' }>,
): ValidationResult {
  if (state.phase !== 'swim') {
    return { valid: false, error: 'Not in swim phase.' };
  }

  if (state.swimmingPlayerId !== player.id) {
    return { valid: false, error: 'It is not your turn to swim.' };
  }

  const validPositions = getValidSwimPositions(state, player);
  const isValid = validPositions.some((p) => positionsEqual(p, action.targetPosition));

  if (!isValid) {
    return { valid: false, error: 'Invalid swim destination.' };
  }

  return { valid: true };
}
