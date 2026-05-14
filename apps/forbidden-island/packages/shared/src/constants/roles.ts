import type { Role, RoleName } from '../types/players.js';

/** All 6 adventurer roles, matching pieces-roles.jsx. */
export const ROLES: readonly Role[] = [
  {
    name: 'explorer',
    displayName: 'Explorer',
    color: '#7aa544',
    description: 'Move and shore up diagonally (8-direction).',
    startingTile: 'copper_gate',
    glyph: 'compass',
  },
  {
    name: 'diver',
    displayName: 'Diver',
    color: '#231a10',
    description: 'Move through any number of flooded or sunk tiles to reach a tile.',
    startingTile: 'iron_gate',
    glyph: 'goggles',
  },
  {
    name: 'engineer',
    displayName: 'Engineer',
    color: '#c33e2c',
    description: 'Shore up two tiles for one action.',
    startingTile: 'bronze_gate',
    glyph: 'gear',
  },
  {
    name: 'pilot',
    displayName: 'Pilot',
    color: '#3b7cc4',
    description: 'Fly to any tile, once per turn (1 action).',
    startingTile: 'fools_landing',
    glyph: 'wings',
  },
  {
    name: 'messenger',
    displayName: 'Messenger',
    color: '#f3ead4',
    description: 'Give Treasure cards to any player on any tile.',
    startingTile: 'silver_gate',
    glyph: 'envelope',
  },
  {
    name: 'navigator',
    displayName: 'Navigator',
    color: '#e0b342',
    description: 'Move another player up to two tiles for one action.',
    startingTile: 'gold_gate',
    glyph: 'rose',
  },
];

/** Roles indexed by name for O(1) lookup. */
export const ROLES_BY_NAME: Readonly<Record<RoleName, Role>> =
  Object.fromEntries(ROLES.map((r) => [r.name, r])) as Record<RoleName, Role>;

/** Maps role name to its starting tile id. */
export const ROLE_STARTING_TILES: Readonly<Record<RoleName, string>> =
  Object.fromEntries(ROLES.map((r) => [r.name, r.startingTile])) as Record<RoleName, string>;
