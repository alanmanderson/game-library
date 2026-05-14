export type TileName =
  | 'Temple of the Moon'
  | 'Temple of the Sun'
  | 'Howling Garden'
  | 'Whispering Garden'
  | 'Cave of Embers'
  | 'Cave of Shadows'
  | 'Coral Palace'
  | 'Tidal Palace'
  | 'Bronze Gate'
  | 'Copper Gate'
  | 'Gold Gate'
  | 'Iron Gate'
  | 'Silver Gate'
  | "Fools' Landing"
  | 'Breakers Bridge'
  | 'Cliffs of Abandon'
  | 'Crimson Forest'
  | 'Dunes of Deception'
  | 'Lost Lagoon'
  | 'Misty Marsh'
  | 'Observatory'
  | 'Phantom Rock'
  | 'Twilight Hollow'
  | 'Watchtower';

export type TileState = 'normal' | 'flooded' | 'sunk';

export interface GridPosition {
  row: number;
  col: number;
}

export type TreasureType = 'earth_stone' | 'statue_of_wind' | 'crystal_of_fire' | 'oceans_chalice';

export type RoleName = 'explorer' | 'diver' | 'engineer' | 'pilot' | 'messenger' | 'navigator';

export interface TileDefinition {
  id: string;
  name: TileName;
  hue1: string;
  hue2: string;
  glyph: string;
  treasure?: TreasureType;
  gate?: RoleName;
  special?: string;
}

export interface Tile {
  id: string;
  name: TileName;
  state: TileState;
  position: GridPosition;
  treasure: TreasureType | null;
}
