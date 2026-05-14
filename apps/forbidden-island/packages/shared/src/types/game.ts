import type { Tile, GridPosition, TreasureType } from './tiles.js';
import type { TreasureCard, FloodCard, DeckState, ClientDeckState } from './cards.js';
import type { Player, ClientPlayerView } from './players.js';

export type Difficulty = 'novice' | 'normal' | 'elite' | 'legendary';

export type GamePhase =
  | 'waiting'
  | 'setup'
  | 'action'
  | 'draw_treasure'
  | 'draw_flood'
  | 'discard'
  | 'swim'
  | 'special_card'
  | 'won'
  | 'lost';

export type LossReason =
  | 'fools_landing_sunk'
  | 'both_treasure_tiles_sunk'
  | 'player_drowned'
  | 'water_meter_max';

export interface GameLogEntry {
  timestamp: number;
  playerId: string | null;
  message: string;
  type: 'action' | 'flood' | 'treasure' | 'special' | 'system';
}

export interface GameState {
  id: string;
  phase: GamePhase;
  difficulty: Difficulty;
  waterLevel: number;
  tiles: Tile[];
  players: Player[];
  currentPlayerIndex: number;
  actionsRemaining: number;
  treasureDeck: DeckState<TreasureCard>;
  floodDeck: DeckState<FloodCard>;
  capturedTreasures: TreasureType[];
  pilotUsedAbility: boolean;
  engineerShoreUpCount: number;
  discardingPlayerId: string | null;
  swimmingPlayerId: string | null;
  previousPhase: GamePhase | null;
  lossReason: LossReason | null;
  turnNumber: number;
  log: GameLogEntry[];
  treasureCardsDrawn: number;
  floodCardsDrawn: number;
  navigatorMovesRemaining: number;
  navigatorTargetPlayerId: string | null;
}

export interface ClientGameState {
  id: string;
  phase: GamePhase;
  difficulty: Difficulty;
  waterLevel: number;
  tiles: Tile[];
  players: ClientPlayerView[];
  currentPlayerIndex: number;
  actionsRemaining: number;
  treasureDeck: ClientDeckState<TreasureCard>;
  floodDeck: ClientDeckState<FloodCard>;
  capturedTreasures: TreasureType[];
  pilotUsedAbility: boolean;
  engineerShoreUpCount: number;
  discardingPlayerId: string | null;
  swimmingPlayerId: string | null;
  previousPhase: GamePhase | null;
  lossReason: LossReason | null;
  turnNumber: number;
  log: GameLogEntry[];
  myPlayerId: string;
  treasureCardsDrawn: number;
  floodCardsDrawn: number;
  navigatorMovesRemaining: number;
  navigatorTargetPlayerId: string | null;
}
