/**
 * REST API client for Telestrations.
 */

import type { GameSettings } from './state';

// ===== Types =====

export interface CreateGameRequest {
  hostDisplayName: string;
  settings?: Partial<GameSettings>;
}

export interface CreateGameResponse {
  gameCode: string;
  gameId: string;
  playerId: string;
  reconnectionToken: string;
  settings: GameSettings;
}

export interface JoinGameResponse {
  gameCode: string;
  gameId: string;
  playerId: string;
  reconnectionToken: string;
  gameState: string;
  players: Array<{
    id: string;
    displayName: string;
    isHost: boolean;
    isConnected: boolean;
  }>;
  settings: GameSettings;
}

export interface GameStatusResponse {
  gameCode: string;
  state: string;
  playerCount: number;
  maxPlayers: number;
  canJoin: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// ===== Helpers =====

class ApiClientError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = 'ApiClientError';
    this.code = body.code;
    this.status = status;
    this.details = body.details;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    let errorBody: ApiError;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = {
        code: 'UNKNOWN_ERROR',
        message: `Request failed with status ${response.status}`,
      };
    }
    throw new ApiClientError(response.status, errorBody);
  }

  return response.json();
}

// ===== API Methods =====

export async function createGame(data: CreateGameRequest): Promise<CreateGameResponse> {
  return request<CreateGameResponse>('POST', '/api/games', data);
}

export async function joinGame(code: string, displayName: string): Promise<JoinGameResponse> {
  return request<JoinGameResponse>('POST', `/api/games/${encodeURIComponent(code.toUpperCase())}/join`, {
    displayName,
  });
}

export async function getGameStatus(code: string): Promise<GameStatusResponse> {
  return request<GameStatusResponse>('GET', `/api/games/${encodeURIComponent(code.toUpperCase())}`);
}

export async function getResults(code: string, playerId: string): Promise<unknown> {
  return request('GET', `/api/games/${encodeURIComponent(code.toUpperCase())}/results?playerId=${encodeURIComponent(playerId)}`);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    if (error.message === 'Failed to fetch') {
      return 'Unable to connect to the server. Please check your connection and try again.';
    }
    return error.message;
  }
  return 'An unexpected error occurred.';
}
