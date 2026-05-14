import type { GameState, ServerMessage, Tile, FloodCard } from '@forbidden-island/shared';
import { getFloodCardsForLevel } from '@forbidden-island/shared';
import { drawCard, discardCard, removeFloodCard } from './deck-manager.js';
import { positionsEqual, getValidSwimPositions } from './role-abilities.js';

export interface FloodResult {
  state: GameState;
  events: ServerMessage[];
}

/**
 * Draw flood cards for the current water level and process each one.
 * Handles normal->flooded, flooded->sunk, swim triggers, and loss conditions.
 */
export function drawFloodCards(state: GameState): FloodResult {
  const numCards = getFloodCardsForLevel(state.waterLevel);
  let currentState = { ...state, floodCardsDrawn: 0 };
  const allEvents: ServerMessage[] = [];

  for (let i = 0; i < numCards; i++) {
    const result = drawSingleFloodCard(currentState);
    currentState = result.state;
    allEvents.push(...result.events);

    // If we entered a swim or lost phase, stop drawing
    if (currentState.phase === 'swim' || currentState.phase === 'lost') {
      break;
    }
  }

  // If we finished drawing all flood cards without interruption, update count
  currentState = {
    ...currentState,
    floodCardsDrawn: currentState.floodCardsDrawn,
  };

  return { state: currentState, events: allEvents };
}

/**
 * Draw and process a single flood card.
 */
function drawSingleFloodCard(state: GameState): FloodResult {
  const [newFloodDeck, card] = drawCard(state.floodDeck);
  if (!card) {
    // No more flood cards (shouldn't happen normally)
    return { state: { ...state, floodDeck: newFloodDeck }, events: [] };
  }

  let currentState: GameState = { ...state, floodDeck: newFloodDeck };
  const events: ServerMessage[] = [];

  // Find the tile
  const tile = currentState.tiles.find((t) => t.name === card.tileName);
  if (!tile || tile.state === 'sunk') {
    // Tile already sunk -- card is removed from game, shouldn't be in deck
    return { state: currentState, events: [] };
  }

  if (tile.state === 'normal') {
    // Normal -> Flooded
    const newTiles = currentState.tiles.map((t) =>
      t.name === card.tileName ? { ...t, state: 'flooded' as const } : t,
    );

    // Flood card goes to discard pile
    const newFloodDeckWithDiscard = discardCard(currentState.floodDeck, card);

    currentState = {
      ...currentState,
      tiles: newTiles,
      floodDeck: newFloodDeckWithDiscard,
      floodCardsDrawn: currentState.floodCardsDrawn + 1,
      log: [
        ...currentState.log,
        {
          timestamp: Date.now(),
          playerId: null,
          message: `${card.tileName} is flooding!`,
          type: 'flood' as const,
        },
      ],
    };

    events.push({
      type: 'game:flood_reveal',
      floodCard: card,
      tileName: card.tileName,
      newTileState: 'flooded',
    });
  } else if (tile.state === 'flooded') {
    // Flooded -> Sunk! Card is removed from game permanently.
    const newTiles = currentState.tiles.map((t) =>
      t.name === card.tileName ? { ...t, state: 'sunk' as const } : t,
    );

    // Remove the flood card from the game entirely (not discard -- removed)
    const newFloodDeckWithRemoval = removeFloodCard(currentState.floodDeck, card.tileName);

    currentState = {
      ...currentState,
      tiles: newTiles,
      floodDeck: newFloodDeckWithRemoval,
      floodCardsDrawn: currentState.floodCardsDrawn + 1,
      log: [
        ...currentState.log,
        {
          timestamp: Date.now(),
          playerId: null,
          message: `${card.tileName} has sunk!`,
          type: 'flood' as const,
        },
      ],
    };

    events.push({
      type: 'game:flood_reveal',
      floodCard: card,
      tileName: card.tileName,
      newTileState: 'sunk',
    });

    events.push({
      type: 'game:tile_sunk',
      tileName: card.tileName,
      position: tile.position,
    });

    // Check if any players need to swim
    const playersOnSunkTile = currentState.players.filter((p) =>
      positionsEqual(p.position, tile.position),
    );

    for (const player of playersOnSunkTile) {
      const swimPositions = getValidSwimPositions(currentState, player);
      if (swimPositions.length === 0) {
        // Player drowned -- game lost
        currentState = {
          ...currentState,
          phase: 'lost',
          lossReason: 'player_drowned',
          log: [
            ...currentState.log,
            {
              timestamp: Date.now(),
              playerId: player.id,
              message: `${player.name} has drowned! No adjacent tiles to swim to.`,
              type: 'system' as const,
            },
          ],
        };
        return { state: currentState, events };
      }

      // Trigger swim interrupt
      currentState = {
        ...currentState,
        phase: 'swim',
        swimmingPlayerId: player.id,
        previousPhase: state.phase === 'swim' ? state.previousPhase : state.phase,
      };

      events.push({
        type: 'game:player_must_swim',
        playerId: player.id,
      });

      // Only handle one swimmer at a time (the engine will re-enter for the next)
      return { state: currentState, events };
    }
  }

  return { state: currentState, events };
}
