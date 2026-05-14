// ─── Tile catalog ───────────────────────────────────────────────────────
// Exactly matches pieces-tiles.jsx design reference.

import type { TreasureType, RoleName } from '@forbidden-island/shared/types/tiles';

export interface TileDef {
  id: string;
  name: string;
  hue1: string;
  hue2: string;
  glyph: string;
  treasure?: TreasureType;
  gate?: RoleName;
  special?: string;
}

export const TILES: TileDef[] = [
  // Treasures - Earth Stone
  { id: 'temple_moon', name: 'Temple of the Moon', hue1: '#3a3a72', hue2: '#1c1840', glyph: 'moon', treasure: 'earth_stone' },
  { id: 'temple_sun', name: 'Temple of the Sun', hue1: '#e9a04a', hue2: '#a45c1c', glyph: 'sun', treasure: 'earth_stone' },
  // Statue of the Wind
  { id: 'howling_garden', name: 'Howling Garden', hue1: '#7a9c5e', hue2: '#34522e', glyph: 'spiral', treasure: 'statue_of_wind' },
  { id: 'whispering_garden', name: 'Whispering Garden', hue1: '#9bb87e', hue2: '#4a6a3a', glyph: 'leaf', treasure: 'statue_of_wind' },
  // Crystal of Fire
  { id: 'cave_embers', name: 'Cave of Embers', hue1: '#c25a2a', hue2: '#4a1810', glyph: 'flame', treasure: 'crystal_of_fire' },
  { id: 'cave_shadows', name: 'Cave of Shadows', hue1: '#2c1e30', hue2: '#0c0612', glyph: 'arch', treasure: 'crystal_of_fire' },
  // Ocean's Chalice
  { id: 'coral_palace', name: 'Coral Palace', hue1: '#d76e6a', hue2: '#722a2a', glyph: 'chalice', treasure: 'oceans_chalice' },
  { id: 'tidal_palace', name: 'Tidal Palace', hue1: '#3aa0b8', hue2: '#0c4e60', glyph: 'wave', treasure: 'oceans_chalice' },
  // Gates (5)
  { id: 'bronze_gate', name: 'Bronze Gate', hue1: '#a55c2c', hue2: '#3d1f0e', glyph: 'gate', gate: 'engineer' },
  { id: 'copper_gate', name: 'Copper Gate', hue1: '#c47a4c', hue2: '#4a2814', glyph: 'gate', gate: 'explorer' },
  { id: 'gold_gate', name: 'Gold Gate', hue1: '#dfb555', hue2: '#5e421c', glyph: 'gate', gate: 'navigator' },
  { id: 'iron_gate', name: 'Iron Gate', hue1: '#7a8086', hue2: '#2a2e34', glyph: 'gate', gate: 'diver' },
  { id: 'silver_gate', name: 'Silver Gate', hue1: '#c5c5c5', hue2: '#5e5e5e', glyph: 'gate', gate: 'messenger' },
  // Fools' Landing
  { id: 'fools_landing', name: "Fools' Landing", hue1: '#e8c47a', hue2: '#6a4a1c', glyph: 'helipad', special: 'landing' },
  // Other 10
  { id: 'breakers_bridge', name: 'Breakers Bridge', hue1: '#9c8264', hue2: '#3e2e1e', glyph: 'bridge' },
  { id: 'cliffs_abandon', name: 'Cliffs of Abandon', hue1: '#7a6a5e', hue2: '#2c241e', glyph: 'cliff' },
  { id: 'crimson_forest', name: 'Crimson Forest', hue1: '#8a3a2c', hue2: '#3a120c', glyph: 'forest' },
  { id: 'dunes_deception', name: 'Dunes of Deception', hue1: '#deba7a', hue2: '#6c4a22', glyph: 'dunes' },
  { id: 'lost_lagoon', name: 'Lost Lagoon', hue1: '#4ab0a4', hue2: '#0c4844', glyph: 'lagoon' },
  { id: 'misty_marsh', name: 'Misty Marsh', hue1: '#7e8c80', hue2: '#2c3c34', glyph: 'marsh' },
  { id: 'observatory', name: 'Observatory', hue1: '#3a4068', hue2: '#10142c', glyph: 'star' },
  { id: 'phantom_rock', name: 'Phantom Rock', hue1: '#605870', hue2: '#1c1828', glyph: 'monolith' },
  { id: 'twilight_hollow', name: 'Twilight Hollow', hue1: '#4a3a5c', hue2: '#181020', glyph: 'hollow' },
  { id: 'watchtower', name: 'Watchtower', hue1: '#866844', hue2: '#2c1c10', glyph: 'tower' },
];

export const TILES_BY_ID: Record<string, TileDef> = Object.fromEntries(
  TILES.map((t) => [t.id, t])
);

// ─── Treasure data ──────────────────────────────────────────────────────
export interface TreasureInfo {
  name: string;
  color: string;
  glyph: string;
}

export const TREASURE_DATA: Record<string, TreasureInfo> = {
  earth_stone: { name: 'The Earth Stone', color: '#7aa544', glyph: 'stone' },
  statue_of_wind: { name: 'The Statue of the Wind', color: '#c9c0a0', glyph: 'wind' },
  crystal_of_fire: { name: 'The Crystal of Fire', color: '#e07140', glyph: 'fire' },
  oceans_chalice: { name: "The Ocean's Chalice", color: '#3ba0c0', glyph: 'chalice2' },
};

// ─── Board mask ─────────────────────────────────────────────────────────
export const BOARD_MASK = [
  [0, 0, 1, 1, 0, 0],
  [0, 1, 1, 1, 1, 0],
  [1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 0, 0],
];

// ─── Sample layout for lobby / demo screens ─────────────────────────────
export const SAMPLE_LAYOUT = [
  ['temple_moon', 'temple_sun'],
  ['howling_garden', 'breakers_bridge', 'cliffs_abandon', 'whispering_garden'],
  ['bronze_gate', 'crimson_forest', 'dunes_deception', 'copper_gate', 'observatory', 'phantom_rock'],
  ['gold_gate', 'cave_embers', 'fools_landing', 'lost_lagoon', 'misty_marsh', 'iron_gate'],
  ['silver_gate', 'tidal_palace', 'twilight_hollow', 'coral_palace'],
  ['watchtower', 'cave_shadows'],
];

export interface GridTile {
  id: string;
  row: number;
  col: number;
}

export function flattenLayout(layout: string[][] = SAMPLE_LAYOUT): GridTile[] {
  const tiles: GridTile[] = [];
  let idx = 0;
  layout.forEach((row) => {
    row.forEach((id) => {
      tiles.push({ id, row: -1, col: -1 });
    });
  });
  idx = 0;
  BOARD_MASK.forEach((row, r) => {
    const inRow: number[] = [];
    row.forEach((v, c) => { if (v) inRow.push(c); });
    layout[r].forEach((_id, k) => {
      tiles[idx].row = r;
      tiles[idx].col = inRow[k];
      idx++;
    });
  });
  return tiles;
}
