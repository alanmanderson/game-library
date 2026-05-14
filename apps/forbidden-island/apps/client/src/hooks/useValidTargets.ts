import { useMemo } from 'react';
import { useStore } from '../store/store';
import { BOARD_MASK } from '../data/tiles';
import type { GridPosition, Tile, TreasureType } from '@forbidden-island/shared/types/tiles';
import type { ClientPlayerView } from '@forbidden-island/shared/types/players';
import type { ClientGameState } from '@forbidden-island/shared/types/game';

// ─── Position helpers ───────────────────────────────────────────────────

function isValidBoardPosition(pos: GridPosition): boolean {
  return (
    pos.row >= 0 && pos.row < 6 &&
    pos.col >= 0 && pos.col < 6 &&
    BOARD_MASK[pos.row][pos.col] === 1
  );
}

function positionsEqual(a: GridPosition, b: GridPosition): boolean {
  return a.row === b.row && a.col === b.col;
}

function getTileAtPosition(tiles: Tile[], pos: GridPosition): Tile | undefined {
  return tiles.find((t) => positionsEqual(t.position, pos));
}

function posKey(p: GridPosition): string {
  return `${p.row},${p.col}`;
}

/** Cardinal directions: up, down, left, right. */
const CARDINAL_DELTAS: GridPosition[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

/** Diagonal directions. */
const DIAGONAL_DELTAS: GridPosition[] = [
  { row: -1, col: -1 },
  { row: -1, col: 1 },
  { row: 1, col: -1 },
  { row: 1, col: 1 },
];

const ALL_DELTAS: GridPosition[] = [...CARDINAL_DELTAS, ...DIAGONAL_DELTAS];

// ─── Exported helpers (used by the hook and potentially by components) ──

export function getAdjacentPositions(pos: GridPosition): GridPosition[] {
  return CARDINAL_DELTAS
    .map((d) => ({ row: pos.row + d.row, col: pos.col + d.col }))
    .filter(isValidBoardPosition);
}

export function getDiagonalPositions(pos: GridPosition): GridPosition[] {
  return DIAGONAL_DELTAS
    .map((d) => ({ row: pos.row + d.row, col: pos.col + d.col }))
    .filter(isValidBoardPosition);
}

export function getAllNonSunkPositions(tiles: Tile[]): GridPosition[] {
  return tiles
    .filter((t) => t.state !== 'sunk')
    .map((t) => t.position);
}

/**
 * Diver BFS: can pass through adjacent flooded or sunk cells,
 * must end on a non-sunk tile that is not the starting position.
 * Mirrors server's getDiverMovePositions exactly.
 */
export function getDiverReachable(tiles: Tile[], start: GridPosition): GridPosition[] {
  const visited = new Set<string>();
  const queue: GridPosition[] = [];
  const results: GridPosition[] = [];

  // First add normal cardinal adjacent non-sunk tiles
  const normalAdj = getAdjacentPositions(start);
  for (const adj of normalAdj) {
    const tile = getTileAtPosition(tiles, adj);
    if (!tile) continue;
    if (tile.state !== 'sunk') {
      if (!visited.has(posKey(adj))) {
        visited.add(posKey(adj));
        results.push(adj);
      }
    }
    // For diver, also start BFS from flooded/sunk adjacent tiles
    if (tile.state === 'flooded' || tile.state === 'sunk') {
      if (!visited.has(posKey(adj))) {
        visited.add(posKey(adj));
        queue.push(adj);
        if (tile.state !== 'sunk') {
          results.push(adj);
        }
      }
    }
  }

  // BFS through flooded/sunk tiles
  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = getAdjacentPositions(current);
    for (const neighbor of neighbors) {
      if (positionsEqual(neighbor, start)) continue;
      if (visited.has(posKey(neighbor))) continue;
      visited.add(posKey(neighbor));

      const tile = getTileAtPosition(tiles, neighbor);
      if (!tile) continue;

      if (tile.state !== 'sunk') {
        results.push(neighbor);
      }
      if (tile.state === 'flooded' || tile.state === 'sunk') {
        queue.push(neighbor);
      }
    }
  }

  return results;
}

// ─── Target computation per action mode ─────────────────────────────────

function computeMoveTargets(
  tiles: Tile[],
  player: ClientPlayerView,
  pilotUsedAbility: boolean,
): Record<string, string> {
  const targets: Record<string, string> = {};
  const role = player.role;
  const pos = player.position;

  if (role === 'pilot' && !pilotUsedAbility) {
    // Pilot can fly to ANY non-sunk tile (once per turn)
    for (const tile of tiles) {
      if (tile.state !== 'sunk' && !positionsEqual(tile.position, pos)) {
        targets[tile.id] = 'fly';
      }
    }
    return targets;
  }

  if (role === 'diver') {
    const reachable = getDiverReachable(tiles, pos);
    for (const rPos of reachable) {
      const tile = getTileAtPosition(tiles, rPos);
      if (tile) targets[tile.id] = 'move';
    }
    return targets;
  }

  // Explorer: 8 directions. Others: 4 cardinal.
  const includeDiag = role === 'explorer';
  const deltas = includeDiag ? ALL_DELTAS : CARDINAL_DELTAS;
  const adjacent = deltas
    .map((d) => ({ row: pos.row + d.row, col: pos.col + d.col }))
    .filter(isValidBoardPosition);

  for (const adj of adjacent) {
    const tile = getTileAtPosition(tiles, adj);
    if (tile && tile.state !== 'sunk') {
      targets[tile.id] = 'move';
    }
  }

  return targets;
}

function computeShoreTargets(
  tiles: Tile[],
  player: ClientPlayerView,
): Record<string, string> {
  const targets: Record<string, string> = {};
  const role = player.role;
  const pos = player.position;

  // Own tile if flooded
  const ownTile = getTileAtPosition(tiles, pos);
  if (ownTile && ownTile.state === 'flooded') {
    targets[ownTile.id] = 'shore';
  }

  // Adjacent tiles (Explorer includes diagonals)
  const includeDiag = role === 'explorer';
  const deltas = includeDiag ? ALL_DELTAS : CARDINAL_DELTAS;
  const adjacent = deltas
    .map((d) => ({ row: pos.row + d.row, col: pos.col + d.col }))
    .filter(isValidBoardPosition);

  for (const adj of adjacent) {
    const tile = getTileAtPosition(tiles, adj);
    if (tile && tile.state === 'flooded') {
      targets[tile.id] = 'shore';
    }
  }

  return targets;
}

function computeGiveTargets(
  tiles: Tile[],
  player: ClientPlayerView,
  players: ClientPlayerView[],
): Record<string, string> {
  const targets: Record<string, string> = {};
  const role = player.role;
  const pos = player.position;

  for (const p of players) {
    if (p.id === player.id) continue;

    if (role === 'messenger') {
      // Messenger can give to anyone -- highlight their tile
      const tile = getTileAtPosition(tiles, p.position);
      if (tile) targets[tile.id] = 'give';
    } else {
      // Must be on same tile
      if (positionsEqual(p.position, pos)) {
        const tile = getTileAtPosition(tiles, pos);
        if (tile) targets[tile.id] = 'give';
      }
    }
  }

  return targets;
}

// ─── The hook ───────────────────────────────────────────────────────────

/**
 * Computes valid target tiles for the currently selected action mode.
 * Returns a map of { tileId: targetType } for highlighting on the board.
 *
 * Mirrors the server's role-abilities.ts validation logic, running client-side
 * for instant UX feedback. The server still validates all actions.
 */
export function useValidTargets(actionMode: string | null): Record<string, string> {
  const gameState = useStore((s) => s.gameState);

  return useMemo(() => {
    if (!actionMode || !gameState) return {};

    const { tiles, players, currentPlayerIndex, pilotUsedAbility, actionsRemaining, phase } = gameState;

    // Only compute during action phase with actions remaining
    if (phase !== 'action' || actionsRemaining <= 0) return {};

    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer) return {};

    // Only compute for the local player's turn
    if (currentPlayer.id !== gameState.myPlayerId) return {};

    switch (actionMode) {
      case 'move':
        return computeMoveTargets(tiles, currentPlayer, pilotUsedAbility);
      case 'shore':
        return computeShoreTargets(tiles, currentPlayer);
      case 'give':
        return computeGiveTargets(tiles, currentPlayer, players);
      case 'capture':
        // No tile highlighting for capture -- the button is simply enabled/disabled
        return {};
      default:
        return {};
    }
  }, [actionMode, gameState]);
}
