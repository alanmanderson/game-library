import type { TileName } from './tiles.js';

export type { TreasureType } from './tiles.js';
import type { TreasureType } from './tiles.js';

export type TreasureCardType = TreasureType | 'helicopter_lift' | 'waters_rise' | 'sandbags';

export interface TreasureCard {
  id: string;
  type: TreasureCardType;
}

export interface FloodCard {
  id: string;
  tileName: TileName;
}

export interface DeckState<T> {
  drawPile: T[];
  discardPile: T[];
}

export interface ClientDeckState<T> {
  drawPileCount: number;
  discardPile: T[];
}
