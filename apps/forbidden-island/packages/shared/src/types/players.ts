import type { GridPosition, RoleName } from './tiles.js';
import type { TreasureCard } from './cards.js';

export type { RoleName } from './tiles.js';

export interface Role {
  name: RoleName;
  displayName: string;
  color: string;
  description: string;
  startingTile: string;
  glyph: string;
}

export interface Player {
  id: string;
  name: string;
  role: RoleName;
  position: GridPosition;
  hand: TreasureCard[];
  isConnected: boolean;
}

export interface ClientPlayerView {
  id: string;
  name: string;
  role: RoleName;
  position: GridPosition;
  hand: TreasureCard[] | null;
  handCount: number;
  isConnected: boolean;
}
