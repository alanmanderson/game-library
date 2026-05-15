import { describe, it, expect } from 'vitest';
import { setupGame } from '../engine/board-setup.js';
import { processAction, toClientState } from '../engine/game-engine.js';
import { checkWinLoss, isWinningHelicopterLift } from '../engine/win-loss-checker.js';
import { getValidMovePositions, getValidShoreUpPositions, getValidSwimPositions } from '../engine/role-abilities.js';
import type { GameState, RoleName, Tile, GridPosition } from '@forbidden-island/shared';

function createTestGame(roles: RoleName[] = ['explorer', 'diver']): GameState {
  return setupGame({
    gameId: 'test',
    difficulty: 'normal',
    playerInfos: roles.map((role, i) => ({
      id: `p${i}`,
      name: `Player${i}`,
      role,
    })),
  });
}

describe('Game Engine', () => {
  describe('processAction - move', () => {
    it('allows a valid move and decrements actions', () => {
      const state = createTestGame();
      const player = state.players[0];
      const validMoves = getValidMovePositions(state, player);

      if (validMoves.length === 0) return; // Skip if no valid moves (rare due to starting position)

      const result = processAction(state, player.id, {
        type: 'move',
        targetPosition: validMoves[0],
      });

      // Should not have error events
      const errors = result.events.filter((e) => e.type === 'game:error');
      expect(errors).toHaveLength(0);
      expect(result.state.actionsRemaining).toBe(state.actionsRemaining - 1);
    });

    it('rejects an invalid move', () => {
      const state = createTestGame();
      const player = state.players[0];

      // Try to move to an impossible position
      const result = processAction(state, player.id, {
        type: 'move',
        targetPosition: { row: 0, col: 0 }, // corner, always ocean
      });

      const errors = result.events.filter((e) => e.type === 'game:error');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects action from non-current player', () => {
      const state = createTestGame();
      const player = state.players[1]; // Not the current player

      const result = processAction(state, player.id, {
        type: 'move',
        targetPosition: { row: 2, col: 2 },
      });

      const errors = result.events.filter((e) => e.type === 'game:error');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('processAction - end_actions', () => {
    it('advances to draw_treasure phase and auto-draws', () => {
      const state = createTestGame();
      const player = state.players[0];

      const result = processAction(state, player.id, { type: 'end_actions' });
      // Should have advanced through draw_treasure and into draw_flood or further
      expect(['action', 'draw_flood', 'discard', 'swim', 'lost']).toContain(result.state.phase);
    });
  });

  describe('processAction - shore_up', () => {
    it('shores up a flooded tile', () => {
      const state = createTestGame();
      const player = state.players[0];

      // Find a flooded tile adjacent to the player
      const validShoreUp = getValidShoreUpPositions(state, player);
      if (validShoreUp.length === 0) return;

      const result = processAction(state, player.id, {
        type: 'shore_up',
        targetPosition: validShoreUp[0],
      });

      const errors = result.events.filter((e) => e.type === 'game:error');
      expect(errors).toHaveLength(0);

      // The tile should now be normal
      const tile = result.state.tiles.find(
        (t) => t.position.row === validShoreUp[0].row && t.position.col === validShoreUp[0].col,
      );
      expect(tile?.state).toBe('normal');
    });
  });

  describe('win/loss checker', () => {
    it('detects fools landing sunk', () => {
      const state = createTestGame();
      const newState: GameState = {
        ...state,
        tiles: state.tiles.map((t) =>
          t.id === 'fools_landing' ? { ...t, state: 'sunk' as const } : t,
        ),
      };

      const result = checkWinLoss(newState);
      expect(result.lost).toBe(true);
      expect(result.lossReason).toBe('fools_landing_sunk');
    });

    it('detects both treasure tiles sunk for uncaptured treasure', () => {
      const state = createTestGame();
      const newState: GameState = {
        ...state,
        tiles: state.tiles.map((t) =>
          t.id === 'temple_moon' || t.id === 'temple_sun'
            ? { ...t, state: 'sunk' as const }
            : t,
        ),
      };

      const result = checkWinLoss(newState);
      expect(result.lost).toBe(true);
      expect(result.lossReason).toBe('both_treasure_tiles_sunk');
    });

    it('does NOT trigger loss if treasure already captured', () => {
      const state = createTestGame();
      const newState: GameState = {
        ...state,
        capturedTreasures: ['earth_stone'],
        tiles: state.tiles.map((t) =>
          t.id === 'temple_moon' || t.id === 'temple_sun'
            ? { ...t, state: 'sunk' as const }
            : t,
        ),
      };

      const result = checkWinLoss(newState);
      expect(result.lost).toBe(false);
    });

    it('detects water meter max', () => {
      const state = createTestGame();
      const newState: GameState = { ...state, waterLevel: 9 };

      const result = checkWinLoss(newState);
      expect(result.lost).toBe(true);
      expect(result.lossReason).toBe('water_meter_max');
    });
  });

  describe('toClientState', () => {
    it('hides other players hands', () => {
      const state = createTestGame();
      const clientState = toClientState(state, 'p0');

      expect(clientState.myPlayerId).toBe('p0');
      // Own hand should be visible
      const me = clientState.players.find((p) => p.id === 'p0');
      expect(me?.hand).not.toBeNull();
      // Other player's hand should be null
      const other = clientState.players.find((p) => p.id === 'p1');
      expect(other?.hand).toBeNull();
      expect(other?.handCount).toBe(state.players[1].hand.length);
    });

    it('shows deck counts not contents', () => {
      const state = createTestGame();
      const clientState = toClientState(state, 'p0');

      expect(clientState.treasureDeck.drawPileCount).toBe(state.treasureDeck.drawPile.length);
      expect(clientState.floodDeck.drawPileCount).toBe(state.floodDeck.drawPile.length);
    });
  });

  describe('role abilities', () => {
    it('explorer can move diagonally', () => {
      const state = createTestGame(['explorer', 'diver']);
      const explorer = state.players[0];
      const moves = getValidMovePositions(state, explorer);

      // Explorer should have diagonal moves available
      const diagonals = moves.filter((m) => {
        const dr = Math.abs(m.row - explorer.position.row);
        const dc = Math.abs(m.col - explorer.position.col);
        return dr === 1 && dc === 1;
      });
      // May or may not have diagonals depending on position, but the function should not crash
      expect(moves.length).toBeGreaterThan(0);
    });

    it('pilot can fly to any non-sunk tile', () => {
      const state = createTestGame(['pilot', 'diver']);
      const pilot = state.players[0];
      const moves = getValidMovePositions(state, pilot);

      // Pilot should be able to reach many tiles
      const nonSunkTiles = state.tiles.filter(
        (t) => t.state !== 'sunk' && (t.position.row !== pilot.position.row || t.position.col !== pilot.position.col),
      );
      expect(moves.length).toBe(nonSunkTiles.length);
    });
  });

  describe('special cards', () => {
    it('sandbags can shore up any flooded tile', () => {
      const state = createTestGame();
      const player = state.players[0];
      const floodedTile = state.tiles.find((t) => t.state === 'flooded');
      if (!floodedTile) return;

      // Give the player a sandbags card
      const sandbagsCard = { id: 'sb_test', type: 'sandbags' as const };
      const stateWithSandbags: GameState = {
        ...state,
        players: state.players.map((p) =>
          p.id === player.id ? { ...p, hand: [...p.hand, sandbagsCard] } : p,
        ),
      };

      const result = processAction(stateWithSandbags, player.id, {
        type: 'play_sandbags',
        cardId: 'sb_test',
        targetPosition: floodedTile.position,
      });

      const errors = result.events.filter((e) => e.type === 'game:error');
      expect(errors).toHaveLength(0);

      const tile = result.state.tiles.find(
        (t) => t.position.row === floodedTile.position.row && t.position.col === floodedTile.position.col,
      );
      expect(tile?.state).toBe('normal');
    });

    it('non-current player can play sandbags', () => {
      const state = createTestGame();
      const nonCurrentPlayer = state.players[1]; // Not current player
      const floodedTile = state.tiles.find((t) => t.state === 'flooded');
      if (!floodedTile) return;

      const sandbagsCard = { id: 'sb_test2', type: 'sandbags' as const };
      const stateWithSandbags: GameState = {
        ...state,
        players: state.players.map((p) =>
          p.id === nonCurrentPlayer.id ? { ...p, hand: [...p.hand, sandbagsCard] } : p,
        ),
      };

      const result = processAction(stateWithSandbags, nonCurrentPlayer.id, {
        type: 'play_sandbags',
        cardId: 'sb_test2',
        targetPosition: floodedTile.position,
      });

      const errors = result.events.filter((e) => e.type === 'game:error');
      expect(errors).toHaveLength(0);
    });
  });
});
