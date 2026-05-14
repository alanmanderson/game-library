import type { GridPosition, TreasureType } from './tiles.js';

export interface MoveAction {
  type: 'move';
  targetPosition: GridPosition;
}

export interface ShoreUpAction {
  type: 'shore_up';
  targetPosition: GridPosition;
}

export interface GiveCardAction {
  type: 'give_card';
  cardId: string;
  targetPlayerId: string;
}

export interface CaptureTreasureAction {
  type: 'capture_treasure';
  treasureType: TreasureType;
}

export interface PlayHelicopterLiftAction {
  type: 'play_helicopter_lift';
  cardId: string;
  playerIds: string[];
  targetPosition: GridPosition;
}

export interface PlaySandbagsAction {
  type: 'play_sandbags';
  cardId: string;
  targetPosition: GridPosition;
}

export interface DiscardAction {
  type: 'discard';
  cardId: string;
}

export interface SwimAction {
  type: 'swim';
  targetPosition: GridPosition;
}

export interface EndActionsAction {
  type: 'end_actions';
}

export interface NavigatorMoveAction {
  type: 'navigator_move';
  targetPlayerId: string;
  targetPosition: GridPosition;
}

export type GameAction =
  | MoveAction
  | ShoreUpAction
  | GiveCardAction
  | CaptureTreasureAction
  | PlayHelicopterLiftAction
  | PlaySandbagsAction
  | DiscardAction
  | SwimAction
  | EndActionsAction
  | NavigatorMoveAction;
