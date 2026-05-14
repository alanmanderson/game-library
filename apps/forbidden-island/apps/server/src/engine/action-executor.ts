import type {
  GameState, GameAction, Player, ServerMessage, TreasureCard,
} from '@forbidden-island/shared';
import {
  TREASURE_CARDS_TO_CAPTURE, MAX_HAND_SIZE,
} from '@forbidden-island/shared';
import { discardCard } from './deck-manager.js';
import { positionsEqual, getTileAtPosition } from './role-abilities.js';

export interface ExecutionResult {
  state: GameState;
  events: ServerMessage[];
}

/**
 * Execute a validated action. Returns new state + events.
 * ASSUMES the action has already been validated.
 */
export function executeAction(
  state: GameState,
  playerId: string,
  action: GameAction,
): ExecutionResult {
  switch (action.type) {
    case 'move':
      return executeMove(state, playerId, action);
    case 'shore_up':
      return executeShoreUp(state, playerId, action);
    case 'give_card':
      return executeGiveCard(state, playerId, action);
    case 'capture_treasure':
      return executeCaptureTreasure(state, playerId, action);
    case 'end_actions':
      return executeEndActions(state, playerId);
    case 'navigator_move':
      return executeNavigatorMove(state, playerId, action);
    case 'play_helicopter_lift':
      return executeHelicopterLift(state, playerId, action);
    case 'play_sandbags':
      return executeSandbags(state, playerId, action);
    case 'discard':
      return executeDiscard(state, playerId, action);
    case 'swim':
      return executeSwim(state, playerId, action);
    default:
      return { state, events: [] };
  }
}

function executeMove(
  state: GameState,
  playerId: string,
  action: Extract<GameAction, { type: 'move' }>,
): ExecutionResult {
  const player = state.players.find((p) => p.id === playerId)!;
  const isPilotFly = player.role === 'pilot' && !state.pilotUsedAbility &&
    !isAdjacentCardinal(player.position, action.targetPosition);

  const newPlayers = state.players.map((p) =>
    p.id === playerId
      ? { ...p, position: action.targetPosition }
      : p,
  );

  const newState: GameState = {
    ...state,
    players: newPlayers,
    actionsRemaining: state.actionsRemaining - 1,
    pilotUsedAbility: isPilotFly ? true : state.pilotUsedAbility,
    log: [
      ...state.log,
      {
        timestamp: Date.now(),
        playerId,
        message: `${player.name} moved to ${getTileAtPosition(state.tiles, action.targetPosition)?.name ?? 'unknown'}.`,
        type: 'action' as const,
      },
    ],
  };

  return { state: newState, events: [] };
}

function isAdjacentCardinal(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return (dr + dc) === 1;
}

function executeShoreUp(
  state: GameState,
  playerId: string,
  action: Extract<GameAction, { type: 'shore_up' }>,
): ExecutionResult {
  const player = state.players.find((p) => p.id === playerId)!;

  const newTiles = state.tiles.map((t) =>
    positionsEqual(t.position, action.targetPosition) && t.state === 'flooded'
      ? { ...t, state: 'normal' as const }
      : t,
  );

  const tileName = getTileAtPosition(state.tiles, action.targetPosition)?.name ?? 'unknown';

  let newActionsRemaining = state.actionsRemaining;
  let newEngineerCount = state.engineerShoreUpCount;

  if (player.role === 'engineer') {
    if (state.engineerShoreUpCount === 0) {
      // First shore up of the pair: consume an action, set count to 1
      newActionsRemaining = state.actionsRemaining - 1;
      newEngineerCount = 1;
    } else {
      // Second shore up (free): reset count, don't consume action
      newEngineerCount = 0;
    }
  } else {
    newActionsRemaining = state.actionsRemaining - 1;
  }

  const newState: GameState = {
    ...state,
    tiles: newTiles,
    actionsRemaining: newActionsRemaining,
    engineerShoreUpCount: newEngineerCount,
    log: [
      ...state.log,
      {
        timestamp: Date.now(),
        playerId,
        message: `${player.name} shored up ${tileName}.`,
        type: 'action' as const,
      },
    ],
  };

  return { state: newState, events: [] };
}

function executeGiveCard(
  state: GameState,
  playerId: string,
  action: Extract<GameAction, { type: 'give_card' }>,
): ExecutionResult {
  const player = state.players.find((p) => p.id === playerId)!;
  const targetPlayer = state.players.find((p) => p.id === action.targetPlayerId)!;
  const card = player.hand.find((c) => c.id === action.cardId)!;

  const newPlayers = state.players.map((p) => {
    if (p.id === playerId) {
      return { ...p, hand: p.hand.filter((c) => c.id !== action.cardId) };
    }
    if (p.id === action.targetPlayerId) {
      return { ...p, hand: [...p.hand, card] };
    }
    return p;
  });

  const newState: GameState = {
    ...state,
    players: newPlayers,
    actionsRemaining: state.actionsRemaining - 1,
    log: [
      ...state.log,
      {
        timestamp: Date.now(),
        playerId,
        message: `${player.name} gave a card to ${targetPlayer.name}.`,
        type: 'action' as const,
      },
    ],
  };

  // Check if target player now exceeds hand limit
  const events: ServerMessage[] = [];
  const updatedTarget = newPlayers.find((p) => p.id === action.targetPlayerId)!;
  if (updatedTarget.hand.length > MAX_HAND_SIZE) {
    events.push({
      type: 'game:player_must_discard',
      playerId: action.targetPlayerId,
      handCount: updatedTarget.hand.length,
    });
  }

  return { state: newState, events };
}

function executeCaptureTreasure(
  state: GameState,
  playerId: string,
  action: Extract<GameAction, { type: 'capture_treasure' }>,
): ExecutionResult {
  const player = state.players.find((p) => p.id === playerId)!;
  const { treasureType } = action;

  // Discard 4 matching cards
  const matchingCards = player.hand.filter((c) => c.type === treasureType);
  const cardsToDiscard = matchingCards.slice(0, TREASURE_CARDS_TO_CAPTURE);
  const cardIdsToDiscard = new Set(cardsToDiscard.map((c) => c.id));

  const newHand = player.hand.filter((c) => !cardIdsToDiscard.has(c.id));

  let newTreasureDeck = state.treasureDeck;
  for (const card of cardsToDiscard) {
    newTreasureDeck = discardCard(newTreasureDeck, card);
  }

  const newPlayers = state.players.map((p) =>
    p.id === playerId ? { ...p, hand: newHand } : p,
  );

  const newState: GameState = {
    ...state,
    players: newPlayers,
    treasureDeck: newTreasureDeck,
    capturedTreasures: [...state.capturedTreasures, treasureType],
    actionsRemaining: state.actionsRemaining - 1,
    log: [
      ...state.log,
      {
        timestamp: Date.now(),
        playerId,
        message: `${player.name} captured ${treasureType.replace(/_/g, ' ')}!`,
        type: 'treasure' as const,
      },
    ],
  };

  const events: ServerMessage[] = [
    {
      type: 'game:treasure_captured',
      treasureType,
      playerId,
    },
  ];

  return { state: newState, events };
}

function executeEndActions(
  state: GameState,
  _playerId: string,
): ExecutionResult {
  // Reset engineer shore-up count when ending actions early
  const newState: GameState = {
    ...state,
    phase: 'draw_treasure',
    treasureCardsDrawn: 0,
    engineerShoreUpCount: 0,
  };

  return { state: newState, events: [] };
}

function executeNavigatorMove(
  state: GameState,
  playerId: string,
  action: Extract<GameAction, { type: 'navigator_move' }>,
): ExecutionResult {
  const navigator = state.players.find((p) => p.id === playerId)!;
  const targetPlayer = state.players.find((p) => p.id === action.targetPlayerId)!;

  const newPlayers = state.players.map((p) =>
    p.id === action.targetPlayerId
      ? { ...p, position: action.targetPosition }
      : p,
  );

  const tileName = getTileAtPosition(state.tiles, action.targetPosition)?.name ?? 'unknown';

  // Track navigator moves
  let newNavigatorMovesRemaining: number;
  let newNavigatorTargetPlayerId: string | null;
  let newActionsRemaining = state.actionsRemaining;

  if (state.navigatorTargetPlayerId === action.targetPlayerId) {
    // Continuing a move sequence
    newNavigatorMovesRemaining = state.navigatorMovesRemaining - 1;
    newNavigatorTargetPlayerId = newNavigatorMovesRemaining > 0 ? action.targetPlayerId : null;
    if (newNavigatorMovesRemaining <= 0) {
      // Move sequence complete, no additional action cost
      newNavigatorTargetPlayerId = null;
    }
  } else {
    // Starting a new navigator move: costs 1 action, allows up to 2 moves
    newActionsRemaining = state.actionsRemaining - 1;
    newNavigatorMovesRemaining = 1; // 1 more move remaining
    newNavigatorTargetPlayerId = action.targetPlayerId;
  }

  const newState: GameState = {
    ...state,
    players: newPlayers,
    actionsRemaining: newActionsRemaining,
    navigatorMovesRemaining: newNavigatorMovesRemaining,
    navigatorTargetPlayerId: newNavigatorTargetPlayerId,
    log: [
      ...state.log,
      {
        timestamp: Date.now(),
        playerId,
        message: `${navigator.name} moved ${targetPlayer.name} to ${tileName}.`,
        type: 'action' as const,
      },
    ],
  };

  return { state: newState, events: [] };
}

function executeHelicopterLift(
  state: GameState,
  playerId: string,
  action: Extract<GameAction, { type: 'play_helicopter_lift' }>,
): ExecutionResult {
  const player = state.players.find((p) => p.id === playerId)!;
  const card = player.hand.find((c) => c.id === action.cardId)!;

  // Remove card from hand
  const newPlayers = state.players.map((p) => {
    if (p.id === playerId) {
      return { ...p, hand: p.hand.filter((c) => c.id !== action.cardId) };
    }
    // Move specified players
    if (action.playerIds.includes(p.id)) {
      return { ...p, position: action.targetPosition };
    }
    return p;
  });

  const newTreasureDeck = discardCard(state.treasureDeck, card);

  const movedNames = state.players
    .filter((p) => action.playerIds.includes(p.id))
    .map((p) => p.name)
    .join(', ');
  const destTile = getTileAtPosition(state.tiles, action.targetPosition);

  const newState: GameState = {
    ...state,
    players: newPlayers,
    treasureDeck: newTreasureDeck,
    log: [
      ...state.log,
      {
        timestamp: Date.now(),
        playerId,
        message: `${player.name} played Helicopter Lift! ${movedNames} flew to ${destTile?.name ?? 'unknown'}.`,
        type: 'special' as const,
      },
    ],
  };

  return { state: newState, events: [] };
}

function executeSandbags(
  state: GameState,
  playerId: string,
  action: Extract<GameAction, { type: 'play_sandbags' }>,
): ExecutionResult {
  const player = state.players.find((p) => p.id === playerId)!;
  const card = player.hand.find((c) => c.id === action.cardId)!;

  // Remove card from hand
  const newPlayers = state.players.map((p) =>
    p.id === playerId
      ? { ...p, hand: p.hand.filter((c) => c.id !== action.cardId) }
      : p,
  );

  // Shore up the tile
  const newTiles = state.tiles.map((t) =>
    positionsEqual(t.position, action.targetPosition) && t.state === 'flooded'
      ? { ...t, state: 'normal' as const }
      : t,
  );

  const tileName = getTileAtPosition(state.tiles, action.targetPosition)?.name ?? 'unknown';
  const newTreasureDeck = discardCard(state.treasureDeck, card);

  const newState: GameState = {
    ...state,
    players: newPlayers,
    tiles: newTiles,
    treasureDeck: newTreasureDeck,
    log: [
      ...state.log,
      {
        timestamp: Date.now(),
        playerId,
        message: `${player.name} played Sandbags on ${tileName}.`,
        type: 'special' as const,
      },
    ],
  };

  return { state: newState, events: [] };
}

function executeDiscard(
  state: GameState,
  playerId: string,
  action: Extract<GameAction, { type: 'discard' }>,
): ExecutionResult {
  const player = state.players.find((p) => p.id === playerId)!;
  const card = player.hand.find((c) => c.id === action.cardId)!;

  const newPlayers = state.players.map((p) =>
    p.id === playerId
      ? { ...p, hand: p.hand.filter((c) => c.id !== action.cardId) }
      : p,
  );

  const newTreasureDeck = discardCard(state.treasureDeck, card);

  const updatedPlayer = newPlayers.find((p) => p.id === playerId)!;
  const doneDiscarding = updatedPlayer.hand.length <= MAX_HAND_SIZE;

  const newState: GameState = {
    ...state,
    players: newPlayers,
    treasureDeck: newTreasureDeck,
    // Return to previous phase if done discarding
    phase: doneDiscarding ? (state.previousPhase ?? 'action') : 'discard',
    discardingPlayerId: doneDiscarding ? null : state.discardingPlayerId,
    previousPhase: doneDiscarding ? null : state.previousPhase,
    log: [
      ...state.log,
      {
        timestamp: Date.now(),
        playerId,
        message: `${player.name} discarded a card.`,
        type: 'action' as const,
      },
    ],
  };

  return { state: newState, events: [] };
}

function executeSwim(
  state: GameState,
  playerId: string,
  action: Extract<GameAction, { type: 'swim' }>,
): ExecutionResult {
  const player = state.players.find((p) => p.id === playerId)!;

  const newPlayers = state.players.map((p) =>
    p.id === playerId
      ? { ...p, position: action.targetPosition }
      : p,
  );

  const tileName = getTileAtPosition(state.tiles, action.targetPosition)?.name ?? 'unknown';

  const newState: GameState = {
    ...state,
    players: newPlayers,
    phase: state.previousPhase ?? 'draw_flood',
    swimmingPlayerId: null,
    previousPhase: null,
    log: [
      ...state.log,
      {
        timestamp: Date.now(),
        playerId,
        message: `${player.name} swam to ${tileName}.`,
        type: 'action' as const,
      },
    ],
  };

  return { state: newState, events: [] };
}
