import type { GameState, LossReason, TreasureType } from '@forbidden-island/shared';
import { TREASURE_TILES, WATER_METER_MAX } from '@forbidden-island/shared';
import { positionsEqual } from './role-abilities.js';
import { canTreasureStillBeCaptured, allTreasuresCaptured } from './treasure-engine.js';

export interface WinLossResult {
  won: boolean;
  lost: boolean;
  lossReason: LossReason | null;
}

/**
 * Check all win/loss conditions. Called after every state change.
 *
 * Loss conditions (any one):
 *   1. Fools' Landing sinks
 *   2. Both tiles for an uncaptured treasure sink
 *   3. A player drowns (handled in flood-engine during swim check)
 *   4. Water meter reaches skull (level 9)
 *
 * Win condition (all three):
 *   1. All 4 treasures captured
 *   2. All players on Fools' Landing
 *   3. Helicopter Lift played (triggers win in action-executor)
 */
export function checkWinLoss(state: GameState): WinLossResult {
  // Already in terminal state
  if (state.phase === 'won') return { won: true, lost: false, lossReason: null };
  if (state.phase === 'lost') return { won: false, lost: true, lossReason: state.lossReason };

  // Loss: Fools' Landing sunk
  const foolsLanding = state.tiles.find((t) => t.id === 'fools_landing');
  if (foolsLanding && foolsLanding.state === 'sunk') {
    return { won: false, lost: true, lossReason: 'fools_landing_sunk' };
  }

  // Loss: Both tiles for an uncaptured treasure sunk
  const treasureTypes: TreasureType[] = [
    'earth_stone', 'statue_of_wind', 'crystal_of_fire', 'oceans_chalice',
  ];
  for (const treasure of treasureTypes) {
    if (!canTreasureStillBeCaptured(state, treasure)) {
      return { won: false, lost: true, lossReason: 'both_treasure_tiles_sunk' };
    }
  }

  // Loss: Water meter at max
  if (state.waterLevel >= WATER_METER_MAX) {
    return { won: false, lost: true, lossReason: 'water_meter_max' };
  }

  // Loss: Player drowned is handled in flood-engine (swim positions = 0)

  // No loss, no win yet
  return { won: false, lost: false, lossReason: null };
}

/**
 * Check if helicopter lift triggers a win.
 * Called when helicopter lift is played.
 */
export function isWinningHelicopterLift(
  state: GameState,
  playerIds: string[],
  targetPosition: { row: number; col: number },
): boolean {
  if (!allTreasuresCaptured(state)) return false;

  // The foolsLanding tile position
  const foolsLanding = state.tiles.find((t) => t.id === 'fools_landing');
  if (!foolsLanding || foolsLanding.state === 'sunk') return false;

  // After the helicopter lift, check if all players will be on Fools' Landing
  // Players being moved will be at targetPosition, others stay where they are
  const foolsPos = foolsLanding.position;

  // Target must be Fools' Landing for this to be a win
  if (!positionsEqual(targetPosition, foolsPos)) return false;

  // All players not being moved must already be on Fools' Landing
  const allOnFools = state.players.every((p) => {
    if (playerIds.includes(p.id)) {
      // Will be moved to target (which is Fools' Landing)
      return true;
    }
    return positionsEqual(p.position, foolsPos);
  });

  return allOnFools;
}
