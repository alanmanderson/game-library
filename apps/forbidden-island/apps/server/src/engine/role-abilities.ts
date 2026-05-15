import type { GridPosition, Tile, RoleName, Player, GameState } from '@forbidden-island/shared';
import { BOARD_MASK } from '@forbidden-island/shared';

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

/** All 8 directions. */
const ALL_DELTAS: GridPosition[] = [...CARDINAL_DELTAS, ...DIAGONAL_DELTAS];

function getAdjacentPositions(pos: GridPosition, includeDiagonal: boolean): GridPosition[] {
  const deltas = includeDiagonal ? ALL_DELTAS : CARDINAL_DELTAS;
  return deltas
    .map((d) => ({ row: pos.row + d.row, col: pos.col + d.col }))
    .filter(isValidBoardPosition);
}

// ─── Movement ───────────────────────────────────────────────────────────

/**
 * Get valid move destinations for a player, accounting for role abilities.
 */
export function getValidMovePositions(state: GameState, player: Player): GridPosition[] {
  const { tiles } = state;
  const role = player.role;
  const pos = player.position;
  const destinations: GridPosition[] = [];

  if (role === 'pilot' && !state.pilotUsedAbility) {
    // Pilot can fly to ANY non-sunk tile (once per turn), in addition to normal moves
    for (const tile of tiles) {
      if (tile.state !== 'sunk' && !positionsEqual(tile.position, pos)) {
        destinations.push(tile.position);
      }
    }
    return destinations;
  }

  if (role === 'diver') {
    // Diver can move through flooded/sunk tiles to reach a non-sunk tile.
    // BFS: can pass through flooded or sunk tiles, must end on non-sunk tile.
    return getDiverMovePositions(tiles, pos);
  }

  if (role === 'explorer') {
    // Explorer moves in 8 directions (cardinal + diagonal)
    const adjacent = getAdjacentPositions(pos, true);
    for (const adj of adjacent) {
      const tile = getTileAtPosition(tiles, adj);
      if (tile && tile.state !== 'sunk') {
        destinations.push(adj);
      }
    }
    return destinations;
  }

  // Default: cardinal movement to non-sunk adjacent tiles
  const adjacent = getAdjacentPositions(pos, false);
  for (const adj of adjacent) {
    const tile = getTileAtPosition(tiles, adj);
    if (tile && tile.state !== 'sunk') {
      destinations.push(adj);
    }
  }

  // Pilot normal moves (if already used fly this turn)
  if (role === 'pilot') {
    return destinations;
  }

  return destinations;
}

/**
 * Diver BFS: can pass through adjacent flooded or sunk cells,
 * must end on a non-sunk tile that is not the starting position.
 */
function getDiverMovePositions(tiles: Tile[], start: GridPosition): GridPosition[] {
  const visited = new Set<string>();
  const queue: GridPosition[] = [];
  const results: GridPosition[] = [];
  const key = (p: GridPosition) => `${p.row},${p.col}`;

  // First add normal cardinal adjacent non-sunk tiles
  const normalAdj = getAdjacentPositions(start, false);
  for (const adj of normalAdj) {
    const tile = getTileAtPosition(tiles, adj);
    if (!tile) continue;
    if (tile.state !== 'sunk') {
      if (!visited.has(key(adj))) {
        visited.add(key(adj));
        results.push(adj);
      }
    }
    // For diver, also start BFS from flooded/sunk adjacent tiles
    if (tile.state === 'flooded' || tile.state === 'sunk') {
      if (!visited.has(key(adj))) {
        visited.add(key(adj));
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
    const neighbors = getAdjacentPositions(current, false);
    for (const neighbor of neighbors) {
      if (positionsEqual(neighbor, start)) continue;
      if (visited.has(key(neighbor))) continue;
      visited.add(key(neighbor));

      const tile = getTileAtPosition(tiles, neighbor);
      if (!tile) continue;

      if (tile.state !== 'sunk') {
        results.push(neighbor);
      }
      // Can continue through flooded or sunk
      if (tile.state === 'flooded' || tile.state === 'sunk') {
        queue.push(neighbor);
      }
    }
  }

  return results;
}

// ─── Shore Up ───────────────────────────────────────────────────────────

/**
 * Get positions that a player can shore up (flip from flooded to normal).
 */
export function getValidShoreUpPositions(state: GameState, player: Player): GridPosition[] {
  const { tiles } = state;
  const role = player.role;
  const pos = player.position;
  const positions: GridPosition[] = [];

  // Can always shore up own tile if flooded
  const ownTile = getTileAtPosition(tiles, pos);
  if (ownTile && ownTile.state === 'flooded') {
    positions.push(pos);
  }

  // Adjacent tiles (Explorer includes diagonals)
  const includeDiag = role === 'explorer';
  const adjacent = getAdjacentPositions(pos, includeDiag);
  for (const adj of adjacent) {
    const tile = getTileAtPosition(tiles, adj);
    if (tile && tile.state === 'flooded') {
      positions.push(adj);
    }
  }

  return positions;
}

// ─── Swimming ───────────────────────────────────────────────────────────

/**
 * Get valid swim destinations when a player's tile sinks.
 * Uses role abilities for movement.
 */
export function getValidSwimPositions(state: GameState, player: Player): GridPosition[] {
  const { tiles } = state;
  const role = player.role;
  const pos = player.position;

  if (role === 'pilot') {
    // Pilot can swim to ANY non-sunk tile
    return tiles
      .filter((t) => t.state !== 'sunk' && !positionsEqual(t.position, pos))
      .map((t) => t.position);
  }

  if (role === 'diver') {
    // Diver can swim through flooded/sunk tiles
    return getDiverMovePositions(tiles, pos);
  }

  if (role === 'explorer') {
    // Explorer can swim diagonally
    const adjacent = getAdjacentPositions(pos, true);
    return adjacent.filter((adj) => {
      const tile = getTileAtPosition(tiles, adj);
      return tile && tile.state !== 'sunk';
    });
  }

  // Default: adjacent non-sunk tiles (cardinal only)
  const adjacent = getAdjacentPositions(pos, false);
  return adjacent.filter((adj) => {
    const tile = getTileAtPosition(tiles, adj);
    return tile && tile.state !== 'sunk';
  });
}

// ─── Navigator ──────────────────────────────────────────────────────────

/**
 * Get valid positions to move another player to (Navigator ability).
 * Navigator moves another player using NORMAL movement rules (not the
 * target's special ability), up to 2 tiles.
 */
export function getNavigatorMovePositions(
  tiles: Tile[],
  targetPlayerPos: GridPosition,
  movesUsed: number,
): GridPosition[] {
  if (movesUsed >= 2) return [];

  // Normal cardinal movement to non-sunk tiles
  const adjacent = getAdjacentPositions(targetPlayerPos, false);
  return adjacent.filter((adj) => {
    const tile = getTileAtPosition(tiles, adj);
    return tile && tile.state !== 'sunk';
  });
}

// ─── Give Card ──────────────────────────────────────────────────────────

/**
 * Get players that the current player can give cards to.
 * Messenger can give to anyone; others must be on the same tile.
 */
export function getValidGiveTargets(state: GameState, player: Player): Player[] {
  const role = player.role;
  const pos = player.position;

  return state.players.filter((p) => {
    if (p.id === player.id) return false;
    if (role === 'messenger') return true;
    return positionsEqual(p.position, pos);
  });
}

// ─── Exports for position utilities ─────────────────────────────────────

export { positionsEqual, getTileAtPosition, getAdjacentPositions, isValidBoardPosition };
