/**
 * Client-side state management.
 * Simple reactive state with subscriptions.
 */

// ===== Types =====

export type GameState = 'LOBBY' | 'PROMPT' | 'DRAWING' | 'GUESSING' | 'REVIEW' | 'ENDED';

export type ScreenName =
  | 'landing'
  | 'join'
  | 'create'
  | 'lobby'
  | 'prompt'
  | 'drawing'
  | 'guessing'
  | 'waiting'
  | 'transition'
  | 'review'
  | 'gameover';

export interface PlayerInfo {
  id: string;
  displayName: string;
  isHost: boolean;
  isConnected: boolean;
}

export interface GameSettings {
  drawingTimerSeconds: number;
  guessingTimerSeconds: number;
  promptTimerSeconds: number;
  useAllRounds: boolean;
  customRoundCount: number | null;
}

export interface RoundData {
  type: 'PROMPT' | 'DRAWING' | 'GUESSING';
  prompt?: string;
  drawing?: string;
  promptAuthorDisplayName?: string;
  drawingAuthorDisplayName?: string;
  timerStartedAt: string;
  timerDurationMs: number;
  submittedPlayerIds: string[];
  hasSubmitted: boolean;
}

export interface ReviewEntry {
  type: 'PROMPT' | 'DRAWING' | 'GUESS';
  playerDisplayName: string;
  content: string;
  wasAutoSubmitted: boolean;
}

export interface ReviewData {
  currentChainIndex: number;
  totalChains: number;
  chainOriginPlayerDisplayName: string;
  revealedEntries: ReviewEntry[];
  currentEntryIndex: number;
  totalEntries: number;
  isLastChain: boolean;
  isLastEntryInChain: boolean;
}

export interface TransitionData {
  roundCompleted: number;
  nextType: 'DRAWING' | 'GUESSING' | 'REVIEW' | null;
  transitionDurationMs: number;
}

export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

export interface AppState {
  screen: ScreenName;
  connectionStatus: ConnectionStatus;

  // Session
  gameCode: string | null;
  gameId: string | null;
  playerId: string | null;
  displayName: string | null;
  reconnectionToken: string | null;

  // Game
  gameState: GameState | null;
  hostPlayerId: string | null;
  players: PlayerInfo[];
  settings: GameSettings;

  // Round
  currentRound: number | null;
  totalRounds: number | null;
  roundData: RoundData | null;

  // Review
  reviewData: ReviewData | null;

  // Transition
  transitionData: TransitionData | null;

  // Game Over
  resultsAvailableUntil: string | null;

  // Error
  error: string | null;
}

// ===== Default state =====

const defaultSettings: GameSettings = {
  drawingTimerSeconds: 60,
  guessingTimerSeconds: 30,
  promptTimerSeconds: 30,
  useAllRounds: true,
  customRoundCount: null,
};

function createInitialState(): AppState {
  return {
    screen: 'landing',
    connectionStatus: 'disconnected',
    gameCode: null,
    gameId: null,
    playerId: null,
    displayName: null,
    reconnectionToken: null,
    gameState: null,
    hostPlayerId: null,
    players: [],
    settings: { ...defaultSettings },
    currentRound: null,
    totalRounds: null,
    roundData: null,
    reviewData: null,
    transitionData: null,
    resultsAvailableUntil: null,
    error: null,
  };
}

// ===== State singleton =====

type Listener = () => void;

let state: AppState = createInitialState();
const listeners: Set<Listener> = new Set();

export function getState(): Readonly<AppState> {
  return state;
}

export function setState(partial: Partial<AppState>): void {
  state = { ...state, ...partial };
  notify();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('State listener error:', e);
    }
  });
}

export function resetState(): void {
  state = createInitialState();
  notify();
}

// ===== Helpers =====

export function isHost(): boolean {
  return state.playerId != null && state.playerId === state.hostPlayerId;
}

export function getMyPlayer(): PlayerInfo | undefined {
  return state.players.find((p) => p.id === state.playerId);
}

// ===== Session storage =====

const STORAGE_KEYS = {
  gameCode: 'telestrations_gameCode',
  playerId: 'telestrations_playerId',
  displayName: 'telestrations_displayName',
  reconnectionToken: 'telestrations_reconnectionToken',
} as const;

export function saveSession(): void {
  try {
    if (state.gameCode) sessionStorage.setItem(STORAGE_KEYS.gameCode, state.gameCode);
    if (state.playerId) sessionStorage.setItem(STORAGE_KEYS.playerId, state.playerId);
    if (state.displayName) sessionStorage.setItem(STORAGE_KEYS.displayName, state.displayName);
    if (state.reconnectionToken) sessionStorage.setItem(STORAGE_KEYS.reconnectionToken, state.reconnectionToken);
  } catch {
    // sessionStorage may be unavailable
  }
}

export function loadSession(): { gameCode: string; playerId: string; displayName: string; reconnectionToken: string } | null {
  try {
    const gameCode = sessionStorage.getItem(STORAGE_KEYS.gameCode);
    const playerId = sessionStorage.getItem(STORAGE_KEYS.playerId);
    const displayName = sessionStorage.getItem(STORAGE_KEYS.displayName);
    const reconnectionToken = sessionStorage.getItem(STORAGE_KEYS.reconnectionToken);
    if (gameCode && playerId && displayName && reconnectionToken) {
      return { gameCode, playerId, displayName, reconnectionToken };
    }
  } catch {
    // sessionStorage may be unavailable
  }
  return null;
}

export function clearSession(): void {
  try {
    Object.values(STORAGE_KEYS).forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // sessionStorage may be unavailable
  }
}
