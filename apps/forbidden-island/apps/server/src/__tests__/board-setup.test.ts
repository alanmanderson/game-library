import { describe, it, expect } from 'vitest';
import { setupGame } from '../engine/board-setup.js';
import type { RoleName } from '@forbidden-island/shared';
import {
  VALID_POSITIONS, ROLE_STARTING_TILES, INITIAL_FLOOD_COUNT,
  INITIAL_HAND_SIZE, ACTIONS_PER_TURN, DIFFICULTY_STARTING_LEVEL,
} from '@forbidden-island/shared';

function createTestSetup(playerCount = 2) {
  const roles: RoleName[] = ['explorer', 'diver', 'engineer', 'pilot', 'messenger', 'navigator'];
  const playerInfos = Array.from({ length: playerCount }, (_, i) => ({
    id: `player_${i}`,
    name: `Player ${i + 1}`,
    role: roles[i],
  }));

  return setupGame({
    gameId: 'test_game',
    difficulty: 'normal',
    playerInfos,
  });
}

describe('Board Setup', () => {
  it('creates 24 tiles in valid positions', () => {
    const state = createTestSetup();
    expect(state.tiles).toHaveLength(24);

    // All tiles should be in valid board positions
    for (const tile of state.tiles) {
      const isValid = VALID_POSITIONS.some(
        (p) => p.row === tile.position.row && p.col === tile.position.col,
      );
      expect(isValid).toBe(true);
    }
  });

  it('has exactly 6 tiles flooded initially', () => {
    const state = createTestSetup();
    const floodedCount = state.tiles.filter((t) => t.state === 'flooded').length;
    expect(floodedCount).toBe(INITIAL_FLOOD_COUNT);
  });

  it('no tiles are sunk initially', () => {
    const state = createTestSetup();
    const sunkCount = state.tiles.filter((t) => t.state === 'sunk').length;
    expect(sunkCount).toBe(0);
  });

  it('places players on their role starting tiles', () => {
    const state = createTestSetup(2);

    for (const player of state.players) {
      const startingTileId = ROLE_STARTING_TILES[player.role];
      const tile = state.tiles.find((t) => t.id === startingTileId);
      expect(tile).toBeDefined();
      expect(player.position).toEqual(tile!.position);
    }
  });

  it('deals 2 treasure cards per player with no Waters Rise', () => {
    const state = createTestSetup(3);
    for (const player of state.players) {
      expect(player.hand).toHaveLength(INITIAL_HAND_SIZE);
      // No Waters Rise in hand
      expect(player.hand.every((c) => c.type !== 'waters_rise')).toBe(true);
    }
  });

  it('sets correct water level for difficulty', () => {
    for (const difficulty of ['novice', 'normal', 'elite', 'legendary'] as const) {
      const state = setupGame({
        gameId: 'test',
        difficulty,
        playerInfos: [
          { id: 'p1', name: 'A', role: 'explorer' },
          { id: 'p2', name: 'B', role: 'diver' },
        ],
      });
      expect(state.waterLevel).toBe(DIFFICULTY_STARTING_LEVEL[difficulty]);
    }
  });

  it('starts in action phase with 3 actions remaining', () => {
    const state = createTestSetup();
    expect(state.phase).toBe('action');
    expect(state.actionsRemaining).toBe(ACTIONS_PER_TURN);
    expect(state.currentPlayerIndex).toBe(0);
  });

  it('starts with no captured treasures', () => {
    const state = createTestSetup();
    expect(state.capturedTreasures).toHaveLength(0);
  });

  it('unique tile positions (no overlap)', () => {
    const state = createTestSetup();
    const positionKeys = state.tiles.map((t) => `${t.position.row},${t.position.col}`);
    const uniqueKeys = new Set(positionKeys);
    expect(uniqueKeys.size).toBe(24);
  });
});
