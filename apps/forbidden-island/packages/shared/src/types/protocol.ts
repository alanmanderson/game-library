import type { GameAction } from './actions.js';
import type { Difficulty } from './game.js';
import type { RoleName } from './tiles.js';
import type { ClientGameState } from './game.js';
import type { LobbyState, GameListEntry } from './lobby.js';
import type { TreasureType, TileName, GridPosition } from './tiles.js';
import type { TreasureCard, FloodCard } from './cards.js';

// ─── Client -> Server ────────────────────────────────────────────────────

export interface LobbyCreateMessage {
  type: 'lobby:create';
  playerName: string;
  difficulty: Difficulty;
}

export interface LobbyJoinMessage {
  type: 'lobby:join';
  gameId: string;
  playerName: string;
}

export interface LobbyLeaveMessage {
  type: 'lobby:leave';
}

export interface LobbyStartMessage {
  type: 'lobby:start';
}

export interface LobbySetDifficultyMessage {
  type: 'lobby:set_difficulty';
  difficulty: Difficulty;
}

export interface LobbySelectRoleMessage {
  type: 'lobby:select_role';
  role: RoleName;
}

export interface GameActionMessage {
  type: 'game:action';
  action: GameAction;
}

export interface GameReconnectMessage {
  type: 'game:reconnect';
  gameId: string;
  playerId: string;
  secret: string;
}

export type ClientMessage =
  | LobbyCreateMessage
  | LobbyJoinMessage
  | LobbyLeaveMessage
  | LobbyStartMessage
  | LobbySetDifficultyMessage
  | LobbySelectRoleMessage
  | GameActionMessage
  | GameReconnectMessage;

// ─── Server -> Client ────────────────────────────────────────────────────

export interface LobbyIdentityMessage {
  type: 'lobby:identity';
  playerId: string;
  secret: string;
}

export interface LobbyCreatedMessage {
  type: 'lobby:created';
  gameId: string;
  lobbyState: LobbyState;
}

export interface LobbyUpdatedMessage {
  type: 'lobby:updated';
  lobbyState: LobbyState;
}

export interface LobbyErrorMessage {
  type: 'lobby:error';
  message: string;
}

export interface LobbyGameListUpdatedMessage {
  type: 'lobby:game_list_updated';
  games: GameListEntry[];
}

export interface GameStartedMessage {
  type: 'game:started';
  gameState: ClientGameState;
}

export interface GameStateMessage {
  type: 'game:state';
  gameState: ClientGameState;
}

export interface GameFloodRevealMessage {
  type: 'game:flood_reveal';
  floodCard: FloodCard;
  tileName: TileName;
  newTileState: 'flooded' | 'sunk';
}

export interface GameTileSunkMessage {
  type: 'game:tile_sunk';
  tileName: TileName;
  position: GridPosition;
}

export interface GameWatersRiseMessage {
  type: 'game:waters_rise';
  newWaterLevel: number;
}

export interface GameTreasureCapturedMessage {
  type: 'game:treasure_captured';
  treasureType: TreasureType;
  playerId: string;
}

export interface GamePlayerMustSwimMessage {
  type: 'game:player_must_swim';
  playerId: string;
}

export interface GamePlayerMustDiscardMessage {
  type: 'game:player_must_discard';
  playerId: string;
  handCount: number;
}

export interface GameTurnChangedMessage {
  type: 'game:turn_changed';
  currentPlayerIndex: number;
  playerId: string;
}

export interface GameWonMessage {
  type: 'game:won';
  gameState: ClientGameState;
}

export interface GameLostMessage {
  type: 'game:lost';
  gameState: ClientGameState;
  reason: string;
}

export interface GamePlayerDisconnectedMessage {
  type: 'game:player_disconnected';
  playerId: string;
}

export interface GamePlayerReconnectedMessage {
  type: 'game:player_reconnected';
  playerId: string;
}

export interface GameTreasureDrawMessage {
  type: 'game:treasure_draw';
  card: TreasureCard | null;
  playerId: string;
  isWatersRise: boolean;
}

export interface GameErrorMessage {
  type: 'game:error';
  message: string;
}

export type ServerMessage =
  | LobbyIdentityMessage
  | LobbyCreatedMessage
  | LobbyUpdatedMessage
  | LobbyErrorMessage
  | LobbyGameListUpdatedMessage
  | GameStartedMessage
  | GameStateMessage
  | GameFloodRevealMessage
  | GameTileSunkMessage
  | GameWatersRiseMessage
  | GameTreasureCapturedMessage
  | GamePlayerMustSwimMessage
  | GamePlayerMustDiscardMessage
  | GameTurnChangedMessage
  | GameWonMessage
  | GameLostMessage
  | GamePlayerDisconnectedMessage
  | GamePlayerReconnectedMessage
  | GameTreasureDrawMessage
  | GameErrorMessage;
