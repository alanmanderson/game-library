import type { TileDefinition, GridPosition, TreasureType } from '../types/tiles.js';

/** 6x6 grid mask. 1 = playable cell, 0 = ocean. Rows of 2-4-6-6-4-2 = 24 tiles. */
export const BOARD_MASK: readonly (readonly number[])[] = [
  [0, 0, 1, 1, 0, 0],
  [0, 1, 1, 1, 1, 0],
  [1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 0, 0],
];

/** All 24 tile definitions, matching pieces-tiles.jsx exactly. */
export const TILES: readonly TileDefinition[] = [
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

/** Tiles indexed by id for O(1) lookup. */
export const TILES_BY_ID: Readonly<Record<string, TileDefinition>> =
  Object.fromEntries(TILES.map((t) => [t.id, t]));

/** Mapping from treasure type to the two tile ids that can capture it. */
export const TREASURE_TILES: Readonly<Record<TreasureType, readonly [string, string]>> = {
  earth_stone: ['temple_moon', 'temple_sun'],
  statue_of_wind: ['howling_garden', 'whispering_garden'],
  crystal_of_fire: ['cave_embers', 'cave_shadows'],
  oceans_chalice: ['coral_palace', 'tidal_palace'],
};

/** All valid positions on the 6x6 board (where BOARD_MASK is 1). */
export const VALID_POSITIONS: readonly GridPosition[] = (() => {
  const positions: GridPosition[] = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      if (BOARD_MASK[row][col]) {
        positions.push({ row, col });
      }
    }
  }
  return positions;
})();
