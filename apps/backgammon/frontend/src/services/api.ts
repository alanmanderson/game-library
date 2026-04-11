/**
 * REST API service for the backgammon backend.
 *
 * Every function returns a typed promise so that callers can rely on
 * TypeScript inference without manual casting.
 */

import type {
  Player,
  Table,
  MoveRecord,
  StatsOverview,
  DashboardData,
  AuthResponse,
} from "../types/game";
import { TOKEN_KEY } from "../constants";

// ---------------------------------------------------------------------------
// Base URL -- can be overridden via the VITE_API_URL env variable.
// When running behind the Vite dev-server proxy the default empty string
// means requests go to the same origin (and Vite proxies /api to the backend).
// ---------------------------------------------------------------------------

const API_URL: string = import.meta.env.VITE_API_URL || "";

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Generic request helper
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around `fetch` that:
 *  1. Prepends the base API URL.
 *  2. Sets a JSON content-type header by default.
 *  3. Adds Authorization header when a token is stored.
 *  4. Throws an `Error` whose message is the server's `detail` field (or the
 *     HTTP status code) when the response is not OK.
 *  5. Returns the parsed JSON body typed as `T`.
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const token = getStoredToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string>) },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

/** Register a new account with email, password, and nickname. */
export function register(
  email: string,
  password: string,
  nickname: string,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, nickname }),
  });
}

/** Log in with email and password. */
export function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/** Authenticate with a Google ID token. */
export function googleAuth(
  idToken: string,
  nickname?: string,
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ id_token: idToken, nickname }),
  });
}

/** Create a guest player (no account needed). */
export function createGuest(nickname: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/guest", {
    method: "POST",
    body: JSON.stringify({ nickname }),
  });
}

/** Get the currently authenticated player from the JWT. */
export function getMe(): Promise<Player> {
  return request<Player>("/api/auth/me");
}

// ---------------------------------------------------------------------------
// Player endpoints
// ---------------------------------------------------------------------------

/** Register a new player with the given nickname (legacy, creates guest). */
export function createPlayer(nickname: string): Promise<Player> {
  return request<Player>("/api/players", {
    method: "POST",
    body: JSON.stringify({ nickname }),
  });
}

/** Fetch an existing player by their unique ID. */
export function getPlayer(id: string): Promise<Player> {
  return request<Player>(`/api/players/${id}`);
}

/** Retrieve aggregate win/loss statistics for a player. */
export function getPlayerStats(playerId: string): Promise<StatsOverview> {
  return request<StatsOverview>(`/api/players/${playerId}/stats`);
}

/** Fetch the player's dashboard with game history and stats. */
export function getPlayerDashboard(playerId: string): Promise<DashboardData> {
  return request<DashboardData>(`/api/players/${playerId}/dashboard`);
}

// ---------------------------------------------------------------------------
// Table endpoints
// ---------------------------------------------------------------------------

/** Create a new table (game room). The creating player is identified by `playerId`. */
export function createTable(playerId: string, preferredColor?: string, matchPoints?: number): Promise<Table> {
  return request<Table>("/api/tables", {
    method: "POST",
    body: JSON.stringify({ player_id: playerId, preferred_color: preferredColor || null, match_points: matchPoints ?? 5 }),
  });
}

/** Join an existing table as the second player. */
export function joinTable(tableId: string, playerId: string): Promise<Table> {
  return request<Table>(`/api/tables/${tableId}/join`, {
    method: "POST",
    body: JSON.stringify({ player_id: playerId }),
  });
}

/** Invite a bot to join the table as the opponent. */
export function inviteBot(tableId: string, difficulty: string = "hard"): Promise<Table> {
  return request<Table>(`/api/tables/${tableId}/invite-bot`, {
    method: "POST",
    body: JSON.stringify({ difficulty }),
  });
}

/** Fetch the current state of a table (players, status, etc.). */
export function getTable(tableId: string): Promise<Table> {
  return request<Table>(`/api/tables/${tableId}`);
}

/** Retrieve the full move-history log for a game played at `tableId`. */
export function getGameHistory(tableId: string): Promise<MoveRecord[]> {
  return request<MoveRecord[]>(`/api/tables/${tableId}/history`);
}
