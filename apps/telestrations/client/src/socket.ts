/**
 * Socket.IO client wrapper for Telestrations.
 * Manages connection, event handling, and reconnection.
 */

import { io, Socket } from 'socket.io-client';
import {
  setState,
  getState,
  saveSession,
  clearSession,
  type PlayerInfo,
  type RoundData,
  type ReviewData,
  type ReviewEntry,
  type GameSettings,
  type ConnectionStatus,
} from './state';
import { showToast } from './app';

let socket: Socket | null = null;

// ===== Connection =====

export function connectSocket(
  gameCode: string,
  playerId: string,
  reconnectionToken: string
): void {
  // Disconnect existing socket if any
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  socket = io(window.location.origin, {
    auth: {
      gameCode,
      playerId,
      reconnectionToken,
    },
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
    transports: ['websocket', 'polling'],
  });

  setConnectionStatus('connecting');

  // ===== Connection events =====

  socket.on('connect', () => {
    setConnectionStatus('connected');
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') {
      // Server intentionally disconnected us
      setConnectionStatus('disconnected');
    } else {
      setConnectionStatus('reconnecting');
    }
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
    const state = getState();
    if (state.connectionStatus === 'connecting') {
      // Failed initial connection
      setConnectionStatus('disconnected');
    } else {
      setConnectionStatus('reconnecting');
    }
  });

  socket.io.on('reconnect', () => {
    setConnectionStatus('connected');
  });

  socket.io.on('reconnect_failed', () => {
    setConnectionStatus('disconnected');
  });

  // ===== Game events =====

  socket.on('game:state', (data: GameStatePayload) => {
    handleGameState(data);
  });

  socket.on('game:player-joined', (data: PlayerJoinedPayload) => {
    handlePlayerJoined(data);
  });

  socket.on('game:player-left', (data: PlayerLeftPayload) => {
    handlePlayerLeft(data);
  });

  socket.on('game:started', (_data: GameStartedPayload) => {
    // Transition will be handled by round:start
  });

  socket.on('game:host-changed', (data: HostChangedPayload) => {
    handleHostChanged(data);
  });

  socket.on('game:ended', (data: GameEndedPayload) => {
    handleGameEnded(data);
  });

  socket.on('round:start', (data: RoundStartPayload) => {
    handleRoundStart(data);
  });

  socket.on('round:player-submitted', (data: PlayerSubmittedPayload) => {
    handlePlayerSubmitted(data);
  });

  socket.on('round:ended', (data: RoundEndedPayload) => {
    handleRoundEnded(data);
  });

  socket.on('round:tick', (data: TickPayload) => {
    handleTick(data);
  });

  socket.on('review:entry', (data: ReviewEntryPayload) => {
    handleReviewEntry(data);
  });

  socket.on('error', (data: ErrorPayload) => {
    handleError(data);
  });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  setConnectionStatus('disconnected');
}

export function getSocket(): Socket | null {
  return socket;
}

function setConnectionStatus(status: ConnectionStatus): void {
  setState({ connectionStatus: status });
}

// ===== Emit helpers =====

export function emitStartGame(): void {
  socket?.emit('game:start');
}

export function emitSettings(settings: Partial<GameSettings>): void {
  socket?.emit('game:settings', settings);
}

export function emitKickPlayer(targetPlayerId: string): void {
  socket?.emit('game:kick', { targetPlayerId });
}

export function emitSubmit(content: string): void {
  socket?.emit('round:submit', { content });
}

export function emitEndRoundEarly(): void {
  socket?.emit('round:end-early');
}

export function emitReviewNextEntry(): void {
  socket?.emit('review:next-entry');
}

export function emitReviewPrevEntry(): void {
  socket?.emit('review:prev-entry');
}

export function emitReviewNextChain(): void {
  socket?.emit('review:next-chain');
}

export function emitReviewPrevChain(): void {
  socket?.emit('review:prev-chain');
}

export function emitPlayAgain(): void {
  socket?.emit('game:play-again');
}

export function emitLeave(): void {
  socket?.emit('player:leave');
}

// ===== Payload types (matching backend architecture doc) =====

interface GameStatePayload {
  gameCode: string;
  gameId: string;
  state: 'LOBBY' | 'PROMPT' | 'DRAWING' | 'GUESSING' | 'REVIEW' | 'ENDED';
  hostPlayerId: string;
  settings: GameSettings;
  players: PlayerInfo[];
  currentRound: number | null;
  totalRounds: number | null;
  roundData?: RoundData;
  reviewData?: ReviewData;
  newPlayerId?: string;
  newReconnectionToken?: string;
}

interface PlayerJoinedPayload {
  player: PlayerInfo;
  isReconnect: boolean;
  playerCount: number;
}

interface PlayerLeftPayload {
  playerId: string;
  displayName: string;
  reason: 'left' | 'kicked' | 'disconnected' | 'timeout';
  playerCount: number;
  removedFromGame: boolean;
}

interface GameStartedPayload {
  totalRounds: number;
  playerOrder: Array<{
    id: string;
    displayName: string;
    orderIndex: number;
  }>;
}

interface HostChangedPayload {
  previousHostId: string;
  previousHostDisplayName: string;
  newHostId: string;
  newHostDisplayName: string;
  reason: 'left' | 'disconnected' | 'timeout';
}

interface GameEndedPayload {
  gameCode: string;
  resultsAvailableUntil: string;
}

interface RoundStartPayload {
  round: number;
  totalRounds: number;
  type: 'PROMPT' | 'DRAWING' | 'GUESSING';
  timerDurationMs: number;
  timerStartedAt: string;
  prompt?: string;
  promptAuthorDisplayName?: string;
  drawing?: string;
  drawingAuthorDisplayName?: string;
}

interface PlayerSubmittedPayload {
  playerId: string;
  displayName: string;
  submittedCount: number;
  totalPlayers: number;
}

interface RoundEndedPayload {
  roundCompleted: number;
  nextRound: number | null;
  nextType: 'DRAWING' | 'GUESSING' | 'REVIEW' | null;
  transitionDurationMs: number;
}

interface TickPayload {
  remainingMs: number;
}

interface ReviewEntryPayload {
  chainIndex: number;
  totalChains: number;
  chainOriginPlayerDisplayName: string;
  entryIndex: number;
  totalEntries: number;
  entry: {
    type: 'PROMPT' | 'DRAWING' | 'GUESS';
    playerDisplayName: string;
    content: string;
    wasAutoSubmitted: boolean;
  };
  isLastEntryInChain: boolean;
  isLastChain: boolean;
}

interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

// ===== Event handlers =====

function handleGameState(data: GameStatePayload): void {
  const state = getState();

  // Handle play-again: update session with new IDs
  if (data.newPlayerId && data.newReconnectionToken) {
    setState({
      playerId: data.newPlayerId,
      reconnectionToken: data.newReconnectionToken,
    });
    saveSession();
  }

  setState({
    gameCode: data.gameCode,
    gameId: data.gameId,
    gameState: data.state,
    hostPlayerId: data.hostPlayerId,
    settings: data.settings,
    players: data.players,
    currentRound: data.currentRound,
    totalRounds: data.totalRounds,
    roundData: data.roundData || null,
    reviewData: data.reviewData || null,
  });

  // Determine screen based on game state
  switch (data.state) {
    case 'LOBBY':
      setState({ screen: 'lobby' });
      break;
    case 'PROMPT':
      if (data.roundData?.hasSubmitted) {
        setState({ screen: 'waiting' });
      } else {
        setState({ screen: 'prompt' });
      }
      break;
    case 'DRAWING':
      if (data.roundData?.hasSubmitted) {
        setState({ screen: 'waiting' });
      } else {
        setState({ screen: 'drawing' });
      }
      break;
    case 'GUESSING':
      if (data.roundData?.hasSubmitted) {
        setState({ screen: 'waiting' });
      } else {
        setState({ screen: 'guessing' });
      }
      break;
    case 'REVIEW':
      setState({ screen: 'review' });
      break;
    case 'ENDED':
      setState({ screen: 'gameover' });
      break;
  }
}

function handlePlayerJoined(data: PlayerJoinedPayload): void {
  const state = getState();
  const exists = state.players.find((p) => p.id === data.player.id);
  if (exists) {
    // Reconnect: update connection status
    setState({
      players: state.players.map((p) =>
        p.id === data.player.id ? { ...p, isConnected: true } : p
      ),
    });
  } else {
    setState({
      players: [...state.players, data.player],
    });
  }

  if (data.isReconnect) {
    showToast(`${data.player.displayName} reconnected`);
  } else {
    showToast(`${data.player.displayName} joined`);
  }
}

function handlePlayerLeft(data: PlayerLeftPayload): void {
  const state = getState();

  if (data.playerId === state.playerId && data.reason === 'kicked') {
    // We were kicked
    clearSession();
    setState({
      screen: 'landing',
      error: 'You have been removed from the game by the host.',
      gameCode: null,
      gameId: null,
      playerId: null,
      reconnectionToken: null,
      gameState: null,
      players: [],
    });
    disconnectSocket();
    return;
  }

  if (data.removedFromGame) {
    setState({
      players: state.players.filter((p) => p.id !== data.playerId),
    });
  } else {
    setState({
      players: state.players.map((p) =>
        p.id === data.playerId ? { ...p, isConnected: false } : p
      ),
    });
  }

  const verb = data.reason === 'kicked' ? 'was removed' :
    data.reason === 'disconnected' ? 'disconnected' :
    data.reason === 'timeout' ? 'timed out' : 'left';
  showToast(`${data.displayName} ${verb}`);
}

function handleHostChanged(data: HostChangedPayload): void {
  const state = getState();
  setState({
    hostPlayerId: data.newHostId,
    players: state.players.map((p) => ({
      ...p,
      isHost: p.id === data.newHostId,
    })),
  });

  if (data.newHostId === state.playerId) {
    showToast('You are now the host!');
  } else {
    showToast(`${data.newHostDisplayName} is now the host`);
  }
}

function handleGameEnded(data: GameEndedPayload): void {
  setState({
    gameState: 'ENDED',
    screen: 'gameover',
    resultsAvailableUntil: data.resultsAvailableUntil,
  });
}

function handleRoundStart(data: RoundStartPayload): void {
  const roundData: RoundData = {
    type: data.type,
    prompt: data.prompt,
    drawing: data.drawing,
    promptAuthorDisplayName: data.promptAuthorDisplayName,
    drawingAuthorDisplayName: data.drawingAuthorDisplayName,
    timerStartedAt: data.timerStartedAt,
    timerDurationMs: data.timerDurationMs,
    submittedPlayerIds: [],
    hasSubmitted: false,
  };

  const gameState = data.type as 'PROMPT' | 'DRAWING' | 'GUESSING';
  const screen = data.type === 'PROMPT' ? 'prompt' :
    data.type === 'DRAWING' ? 'drawing' : 'guessing';

  setState({
    gameState,
    currentRound: data.round,
    totalRounds: data.totalRounds,
    roundData,
    screen,
    transitionData: null,
  });
}

function handlePlayerSubmitted(data: PlayerSubmittedPayload): void {
  const state = getState();
  if (!state.roundData) return;

  const submittedPlayerIds = [...state.roundData.submittedPlayerIds];
  if (!submittedPlayerIds.includes(data.playerId)) {
    submittedPlayerIds.push(data.playerId);
  }

  setState({
    roundData: {
      ...state.roundData,
      submittedPlayerIds,
      hasSubmitted: state.roundData.hasSubmitted || data.playerId === state.playerId,
    },
  });
}

function handleRoundEnded(data: RoundEndedPayload): void {
  setState({
    transitionData: {
      roundCompleted: data.roundCompleted,
      nextType: data.nextType,
      transitionDurationMs: data.transitionDurationMs,
    },
    screen: data.nextType === 'REVIEW' ? 'transition' : 'transition',
  });
}

function handleTick(data: TickPayload): void {
  const state = getState();
  if (!state.roundData) return;

  // Recalculate timerStartedAt based on remaining time
  const now = new Date().toISOString();
  setState({
    roundData: {
      ...state.roundData,
      timerStartedAt: now,
      timerDurationMs: data.remainingMs,
    },
  });
}

function handleReviewEntry(data: ReviewEntryPayload): void {
  const state = getState();
  const currentReview = state.reviewData;

  let revealedEntries: ReviewEntry[];

  if (!currentReview || currentReview.currentChainIndex !== data.chainIndex) {
    // New chain - start fresh from entry 0
    revealedEntries = [data.entry];
  } else if (data.entryIndex === 0) {
    // Reset to first entry (e.g. navigated to chain start)
    revealedEntries = [data.entry];
  } else {
    // Same chain - accumulate up to current index
    revealedEntries = currentReview.revealedEntries.slice(0, data.entryIndex);
    revealedEntries.push(data.entry);
  }

  setState({
    gameState: 'REVIEW',
    screen: 'review',
    reviewData: {
      currentChainIndex: data.chainIndex,
      totalChains: data.totalChains,
      chainOriginPlayerDisplayName: data.chainOriginPlayerDisplayName,
      revealedEntries,
      currentEntryIndex: data.entryIndex,
      totalEntries: data.totalEntries,
      isLastChain: data.isLastChain,
      isLastEntryInChain: data.isLastEntryInChain,
    },
    transitionData: null,
  });
}

function handleError(data: ErrorPayload): void {
  console.error('Server error:', data.code, data.message);

  if (data.code === 'KICKED') {
    clearSession();
    disconnectSocket();
    setState({
      screen: 'landing',
      error: data.message,
      gameCode: null,
      gameId: null,
      playerId: null,
      reconnectionToken: null,
      gameState: null,
      players: [],
    });
    return;
  }

  if (data.code === 'SESSION_REPLACED') {
    clearSession();
    disconnectSocket();
    setState({
      screen: 'landing',
      error: data.message,
    });
    return;
  }

  if (data.code === 'SERVER_SHUTTING_DOWN') {
    showToast(data.message);
    return;
  }

  showToast(data.message);
}
