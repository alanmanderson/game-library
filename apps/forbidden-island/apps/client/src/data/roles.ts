// ─── Role definitions ───────────────────────────────────────────────────
// Matches pieces-roles.jsx design reference.

import type { RoleName } from '@forbidden-island/shared/types/tiles';

export interface RoleDef {
  id: RoleName;
  name: string;
  colorVar: string;
  startTile: string;
  ability: string;
  glyph: string;
}

export const ROLES: RoleDef[] = [
  {
    id: 'explorer', name: 'Explorer', colorVar: 'role_explorer', startTile: 'copper_gate',
    ability: 'Move and shore up diagonally (8-direction).', glyph: 'compass',
  },
  {
    id: 'diver', name: 'Diver', colorVar: 'role_diver', startTile: 'iron_gate',
    ability: 'Move through any number of flooded or sunk tiles to reach a tile.', glyph: 'goggles',
  },
  {
    id: 'engineer', name: 'Engineer', colorVar: 'role_engineer', startTile: 'bronze_gate',
    ability: 'Shore up two tiles for one action.', glyph: 'gear',
  },
  {
    id: 'pilot', name: 'Pilot', colorVar: 'role_pilot', startTile: 'fools_landing',
    ability: 'Fly to any tile, once per turn (1 action).', glyph: 'wings',
  },
  {
    id: 'messenger', name: 'Messenger', colorVar: 'role_messenger', startTile: 'silver_gate',
    ability: 'Give Treasure cards to any player on any tile.', glyph: 'envelope',
  },
  {
    id: 'navigator', name: 'Navigator', colorVar: 'role_navigator', startTile: 'gold_gate',
    ability: 'Move another player up to two tiles for one action.', glyph: 'rose',
  },
];

export const ROLES_BY_ID: Record<string, RoleDef> = Object.fromEntries(
  ROLES.map((r) => [r.id, r])
);
