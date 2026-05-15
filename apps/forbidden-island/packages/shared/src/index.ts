// Types
export type { TileName, TileState, GridPosition, TreasureType, RoleName, TileDefinition, Tile } from './types/tiles.js';
export type { TreasureCardType, TreasureCard, FloodCard, DeckState, ClientDeckState } from './types/cards.js';
export type { Role, Player, ClientPlayerView } from './types/players.js';
export type {
  Difficulty, GamePhase, LossReason, GameLogEntry, GameState, ClientGameState,
} from './types/game.js';
export type {
  GameAction, MoveAction, ShoreUpAction, GiveCardAction, CaptureTreasureAction,
  PlayHelicopterLiftAction, PlaySandbagsAction, DiscardAction, SwimAction,
  EndActionsAction, NavigatorMoveAction,
} from './types/actions.js';
export type { LobbyState, LobbyPlayer, GameListEntry } from './types/lobby.js';
export type { ClientMessage, ServerMessage } from './types/protocol.js';

// Also export all specific message types for convenience
export type {
  LobbyCreateMessage, LobbyJoinMessage, LobbyLeaveMessage, LobbyStartMessage,
  LobbySetDifficultyMessage, LobbySelectRoleMessage,
  GameActionMessage, GameReconnectMessage,
  LobbyIdentityMessage, LobbyCreatedMessage, LobbyUpdatedMessage, LobbyErrorMessage,
  LobbyGameListUpdatedMessage,
  GameStartedMessage, GameStateMessage, GameFloodRevealMessage, GameTileSunkMessage,
  GameWatersRiseMessage, GameTreasureCapturedMessage, GamePlayerMustSwimMessage,
  GamePlayerMustDiscardMessage, GameTurnChangedMessage, GameWonMessage, GameLostMessage,
  GamePlayerDisconnectedMessage, GamePlayerReconnectedMessage, GameTreasureDrawMessage,
  GameErrorMessage,
} from './types/protocol.js';

// Constants
export {
  BOARD_MASK, TILES, TILES_BY_ID, TREASURE_TILES, VALID_POSITIONS,
} from './constants/board.js';
export {
  ROLES, ROLES_BY_NAME, ROLE_STARTING_TILES,
} from './constants/roles.js';
export {
  TREASURE_DATA, TREASURE_CARDS_PER_TYPE, HELICOPTER_LIFT_COUNT, WATERS_RISE_COUNT,
  SANDBAGS_COUNT, TOTAL_TREASURE_CARDS, TOTAL_FLOOD_CARDS,
} from './constants/cards.js';
export {
  WATER_LEVELS, getFloodCardsForLevel, DIFFICULTY_STARTING_LEVEL,
  MAX_HAND_SIZE, ACTIONS_PER_TURN, INITIAL_FLOOD_COUNT, INITIAL_HAND_SIZE,
  MAX_PLAYERS, MIN_PLAYERS, WATER_METER_MAX, TREASURE_CARDS_TO_CAPTURE,
  TREASURE_CARDS_PER_TURN, DISCONNECT_TIMEOUT_MS, GAME_GC_TIMEOUT_MS,
} from './constants/rules.js';
