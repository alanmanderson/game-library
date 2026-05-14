import type {
  Tile, GridPosition, GameState, Difficulty, Player, TreasureCard,
} from '@forbidden-island/shared';
import {
  TILES, BOARD_MASK, VALID_POSITIONS, ROLE_STARTING_TILES,
  DIFFICULTY_STARTING_LEVEL, INITIAL_FLOOD_COUNT, INITIAL_HAND_SIZE,
  ACTIONS_PER_TURN, TILES_BY_ID,
} from '@forbidden-island/shared';
import type { RoleName } from '@forbidden-island/shared';
import { shuffle } from '../utils/shuffle.js';
import { createTreasureDeck, createFloodDeck, drawCard, discardCard } from './deck-manager.js';

/**
 * Shuffle the 24 tiles into the diamond positions on the 6x6 grid.
 */
export function shuffleTilesIntoPositions(): Tile[] {
  const shuffledDefs = shuffle(TILES);
  const positions = [...VALID_POSITIONS];

  return shuffledDefs.map((def, i) => ({
    id: def.id,
    name: def.name,
    state: 'normal' as const,
    position: positions[i],
    treasure: def.treasure ?? null,
  }));
}

/**
 * Find the grid position of a tile by its id in the given tile array.
 */
function findTilePosition(tiles: Tile[], tileId: string): GridPosition {
  const tile = tiles.find((t) => t.id === tileId);
  if (!tile) throw new Error(`Tile ${tileId} not found`);
  return tile.position;
}

/**
 * Deal initial hands. If a Waters Rise! card is drawn, discard it and redraw.
 * Per rules: "Deal 2 treasure cards per player (redraw any Waters Rise!)"
 */
function dealInitialHands(
  players: Player[],
  treasureDeck: ReturnType<typeof createTreasureDeck>,
): { players: Player[]; treasureDeck: ReturnType<typeof createTreasureDeck> } {
  let deck = treasureDeck;
  const updatedPlayers = players.map((player) => {
    const hand: TreasureCard[] = [];
    let cardsNeeded = INITIAL_HAND_SIZE;

    while (cardsNeeded > 0) {
      const [newDeck, card] = drawCard(deck);
      deck = newDeck;
      if (!card) break;

      if (card.type === 'waters_rise') {
        // Discard Waters Rise! and redraw
        deck = discardCard(deck, card);
        continue;
      }

      hand.push(card);
      cardsNeeded--;
    }

    return { ...player, hand };
  });

  return { players: updatedPlayers, treasureDeck: deck };
}

/**
 * Perform initial flood: draw 6 flood cards and flip those tiles to flooded.
 */
function performInitialFlood(
  tiles: Tile[],
  floodDeck: ReturnType<typeof createFloodDeck>,
): { tiles: Tile[]; floodDeck: ReturnType<typeof createFloodDeck> } {
  let deck = floodDeck;
  let currentTiles = tiles;

  for (let i = 0; i < INITIAL_FLOOD_COUNT; i++) {
    const [newDeck, card] = drawCard(deck);
    deck = newDeck;
    if (!card) break;

    currentTiles = currentTiles.map((tile) =>
      tile.name === card.tileName
        ? { ...tile, state: 'flooded' as const }
        : tile,
    );

    deck = discardCard(deck, card);
  }

  return { tiles: currentTiles, floodDeck: deck };
}

export interface SetupInput {
  gameId: string;
  difficulty: Difficulty;
  playerInfos: Array<{ id: string; name: string; role: RoleName }>;
}

/**
 * Create the full initial GameState from lobby data.
 * Pure function -- no side effects.
 */
export function setupGame(input: SetupInput): GameState {
  const { gameId, difficulty, playerInfos } = input;

  // 1. Shuffle tiles into diamond pattern
  const tiles = shuffleTilesIntoPositions();

  // 2. Create players at their starting positions
  const players: Player[] = playerInfos.map((info) => {
    const startingTileId = ROLE_STARTING_TILES[info.role];
    const position = findTilePosition(tiles, startingTileId);
    return {
      id: info.id,
      name: info.name,
      role: info.role,
      position,
      hand: [],
      isConnected: true,
    };
  });

  // 3. Create decks
  let treasureDeck = createTreasureDeck();
  let floodDeck = createFloodDeck();

  // 4. Deal initial hands (re-dealing Waters Rise)
  const handResult = dealInitialHands(players, treasureDeck);
  const playersWithHands = handResult.players;
  treasureDeck = handResult.treasureDeck;

  // 5. Initial flood of 6 tiles
  const floodResult = performInitialFlood(tiles, floodDeck);
  const floodedTiles = floodResult.tiles;
  floodDeck = floodResult.floodDeck;

  // 6. Set water level based on difficulty
  const waterLevel = DIFFICULTY_STARTING_LEVEL[difficulty];

  return {
    id: gameId,
    phase: 'action',
    difficulty,
    waterLevel,
    tiles: floodedTiles,
    players: playersWithHands,
    currentPlayerIndex: 0,
    actionsRemaining: ACTIONS_PER_TURN,
    treasureDeck,
    floodDeck,
    capturedTreasures: [],
    pilotUsedAbility: false,
    engineerShoreUpCount: 0,
    discardingPlayerId: null,
    swimmingPlayerId: null,
    previousPhase: null,
    lossReason: null,
    turnNumber: 1,
    log: [{
      timestamp: Date.now(),
      playerId: null,
      message: `Game started on ${difficulty} difficulty. Water level: ${waterLevel}.`,
      type: 'system',
    }],
    treasureCardsDrawn: 0,
    floodCardsDrawn: 0,
    navigatorMovesRemaining: 0,
    navigatorTargetPlayerId: null,
  };
}
