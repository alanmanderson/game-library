import type { GameState, TreasureType } from '@forbidden-island/shared';
import { TREASURE_TILES } from '@forbidden-island/shared';

/**
 * Check whether a treasure can still be captured (at least one of its two tiles is not sunk).
 */
export function canTreasureStillBeCaptured(
  state: GameState,
  treasureType: TreasureType,
): boolean {
  // Already captured = always fine
  if (state.capturedTreasures.includes(treasureType)) return true;

  const [tileId1, tileId2] = TREASURE_TILES[treasureType];
  const tile1 = state.tiles.find((t) => t.id === tileId1);
  const tile2 = state.tiles.find((t) => t.id === tileId2);

  // Need at least one non-sunk tile to capture
  const tile1Ok = tile1 && tile1.state !== 'sunk';
  const tile2Ok = tile2 && tile2.state !== 'sunk';

  return !!(tile1Ok || tile2Ok);
}

/**
 * Check if all 4 treasures have been captured.
 */
export function allTreasuresCaptured(state: GameState): boolean {
  return state.capturedTreasures.length === 4;
}
