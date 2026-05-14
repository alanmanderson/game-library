import type { TreasureType } from '../types/tiles.js';

/** Display data for the four treasures, matching pieces-tiles.jsx TREASURE_DATA. */
export const TREASURE_DATA: Readonly<Record<TreasureType, { name: string; color: string; glyph: string }>> = {
  earth_stone: { name: 'The Earth Stone', color: '#7aa544', glyph: 'stone' },
  statue_of_wind: { name: 'The Statue of the Wind', color: '#c9c0a0', glyph: 'wind' },
  crystal_of_fire: { name: 'The Crystal of Fire', color: '#e07140', glyph: 'fire' },
  oceans_chalice: { name: "The Ocean's Chalice", color: '#3ba0c0', glyph: 'chalice2' },
};

/** Treasure deck composition: 5 cards per treasure type = 20, plus specials. */
export const TREASURE_CARDS_PER_TYPE = 5;
export const HELICOPTER_LIFT_COUNT = 3;
export const WATERS_RISE_COUNT = 3;
export const SANDBAGS_COUNT = 2;
export const TOTAL_TREASURE_CARDS =
  4 * TREASURE_CARDS_PER_TYPE + HELICOPTER_LIFT_COUNT + WATERS_RISE_COUNT + SANDBAGS_COUNT;

/** Flood deck: one card per tile = 24 cards. */
export const TOTAL_FLOOD_CARDS = 24;
