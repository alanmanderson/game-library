// -- Game States --

export type GameState = "LOBBY" | "PROMPT" | "DRAWING" | "GUESSING" | "REVIEW" | "ENDED";

// -- Settings --

export type DrawingTimerOption = 30 | 45 | 60 | 90 | 120;
export type GuessingTimerOption = 15 | 20 | 30 | 45 | 60;
export type PromptTimerOption = 15 | 20 | 30 | 45 | 60;

export interface GameSettings {
  drawingTimerSeconds: DrawingTimerOption;
  guessingTimerSeconds: GuessingTimerOption;
  promptTimerSeconds: PromptTimerOption;
  useAllRounds: boolean;
  customRoundCount: number | null;
}

// -- Player --

export interface Player {
  id: string;
  displayName: string;
  isHost: boolean;
  isConnected: boolean;
  reconnectionToken: string;
  joinOrder: number;
  orderIndex: number | null;
  socketId: string | null;
  leftVoluntarily?: boolean;
}

// -- Chain --

export type ChainEntryType = "PROMPT" | "DRAWING" | "GUESS";

export interface ChainEntry {
  type: ChainEntryType;
  playerId: string;
  playerDisplayName: string;
  content: string;
  submittedAt: number;
  wasAutoSubmitted: boolean;
}

export interface Chain {
  originPlayerIndex: number;
  entries: ChainEntry[];
}

// -- Review Cursor --

export interface ReviewCursor {
  chainIndex: number;
  entryIndex: number;
}

// -- Game --

export interface Game {
  id: string;
  code: string;
  state: GameState;
  hostPlayerId: string;
  settings: GameSettings;
  players: Player[];
  chains: Chain[];
  currentRound: number;
  totalRounds: number;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  submittedPlayerIds: Set<string>;
  reviewCursor: ReviewCursor | null;
  createdAt: number;
  endedAt: number | null;
}

// -- Socket metadata attached to each socket --

export interface SocketData {
  gameCode: string;
  playerId: string;
  gameId: string;
}

// -- Server-to-Client event payloads --

export interface PlayerPublic {
  id: string;
  displayName: string;
  isHost: boolean;
  isConnected: boolean;
}

export interface GameStatePayload {
  gameCode: string;
  gameId: string;
  state: GameState;
  hostPlayerId: string;
  settings: GameSettings;
  players: PlayerPublic[];
  currentRound: number | null;
  totalRounds: number | null;
  roundData?: {
    type: "PROMPT" | "DRAWING" | "GUESSING";
    prompt?: string;
    drawing?: string;
    timerStartedAt: string;
    timerDurationMs: number;
    submittedPlayerIds: string[];
    hasSubmitted: boolean;
  };
  reviewData?: {
    currentChainIndex: number;
    totalChains: number;
    chainOriginPlayerDisplayName: string;
    revealedEntries: Array<{
      type: ChainEntryType;
      playerDisplayName: string;
      content: string;
      wasAutoSubmitted: boolean;
    }>;
  };
  newPlayerId?: string;
  newReconnectionToken?: string;
}

export interface PlayerJoinedPayload {
  player: PlayerPublic;
  isReconnect: boolean;
  playerCount: number;
}

export interface PlayerLeftPayload {
  playerId: string;
  displayName: string;
  reason: "left" | "kicked" | "disconnected" | "timeout";
  playerCount: number;
  removedFromGame: boolean;
}

export interface GameStartedPayload {
  totalRounds: number;
  playerOrder: Array<{
    id: string;
    displayName: string;
    orderIndex: number;
  }>;
}

export interface RoundStartPayload {
  round: number;
  totalRounds: number;
  type: "PROMPT" | "DRAWING" | "GUESSING";
  timerDurationMs: number;
  timerStartedAt: string;
  prompt?: string;
  promptAuthorDisplayName?: string;
  drawing?: string;
  drawingAuthorDisplayName?: string;
}

export interface PlayerSubmittedPayload {
  playerId: string;
  displayName: string;
  submittedCount: number;
  totalPlayers: number;
}

export interface RoundEndedPayload {
  roundCompleted: number;
  nextRound: number | null;
  nextType: "DRAWING" | "GUESSING" | "REVIEW" | null;
  transitionDurationMs: number;
}

export interface TickPayload {
  remainingMs: number;
}

export interface ReviewEntryPayload {
  chainIndex: number;
  totalChains: number;
  chainOriginPlayerDisplayName: string;
  entryIndex: number;
  totalEntries: number;
  entry: {
    type: ChainEntryType;
    playerDisplayName: string;
    content: string;
    wasAutoSubmitted: boolean;
  };
  isLastEntryInChain: boolean;
  isLastChain: boolean;
}

export interface HostChangedPayload {
  previousHostId: string;
  previousHostDisplayName: string;
  newHostId: string;
  newHostDisplayName: string;
  reason: "left" | "disconnected" | "timeout";
}

export interface GameEndedPayload {
  gameCode: string;
  resultsAvailableUntil: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

// -- Client-to-Server event payloads --

export interface ReconnectPayload {
  gameCode: string;
  playerId: string;
  reconnectionToken: string;
}

export interface SettingsPayload {
  drawingTimerSeconds?: number;
  guessingTimerSeconds?: number;
  promptTimerSeconds?: number;
  useAllRounds?: boolean;
  customRoundCount?: number | null;
}

export interface KickPayload {
  targetPlayerId: string;
}

export interface SubmitPayload {
  content: string;
}

// -- Socket.IO typed interface maps --

export interface ServerToClientEvents {
  "game:state": (data: GameStatePayload) => void;
  "game:player-joined": (data: PlayerJoinedPayload) => void;
  "game:player-left": (data: PlayerLeftPayload) => void;
  "game:started": (data: GameStartedPayload) => void;
  "game:host-changed": (data: HostChangedPayload) => void;
  "game:ended": (data: GameEndedPayload) => void;
  "round:start": (data: RoundStartPayload) => void;
  "round:player-submitted": (data: PlayerSubmittedPayload) => void;
  "round:ended": (data: RoundEndedPayload) => void;
  "round:tick": (data: TickPayload) => void;
  "review:entry": (data: ReviewEntryPayload) => void;
  "error": (data: ErrorPayload) => void;
}

export interface ClientToServerEvents {
  "player:reconnect": (data: ReconnectPayload) => void;
  "player:leave": () => void;
  "game:start": () => void;
  "game:settings": (data: SettingsPayload) => void;
  "game:kick": (data: KickPayload) => void;
  "round:submit": (data: SubmitPayload) => void;
  "round:end-early": () => void;
  "review:next-entry": () => void;
  "review:prev-entry": () => void;
  "review:next-chain": () => void;
  "review:prev-chain": () => void;
  "game:play-again": () => void;
}

export interface InterServerEvents {
  // placeholder for future use
}
