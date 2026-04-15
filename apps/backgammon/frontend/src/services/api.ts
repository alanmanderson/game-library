/**
 * REST API service for the backgammon backend.
 *
 * Every function returns a typed promise so that callers can rely on
 * TypeScript inference without manual casting.
 */

import type {
  Player,
  PlayerPreferencesUpdate,
  Table,
  LobbyTable,
  ActiveGame,
  PaginatedMoveHistory,
  StatsOverview,
  AdvancedStatsData,
  DashboardData,
  AuthResponse,
  LeaderboardData,
  ReplayData,
  Tournament,
  TournamentBracket,
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

/** Persist the authenticated player's cosmetic preferences. */
export function updateMyPreferences(
  prefs: PlayerPreferencesUpdate,
): Promise<Player> {
  return request<Player>("/api/players/me/preferences", {
    method: "PATCH",
    body: JSON.stringify(prefs),
  });
}

/** Fetch advanced per-player stats (gammon/backgammon rates, cube, rating history). */
export function getPlayerAdvancedStats(
  playerId: string,
): Promise<AdvancedStatsData> {
  return request<AdvancedStatsData>(
    `/api/players/${playerId}/advanced-stats`,
  );
}

// ---------------------------------------------------------------------------
// Table endpoints
// ---------------------------------------------------------------------------

/** Create a new table (game room). The creating player is identified by `playerId`. */
export function createTable(playerId: string, preferredColor?: string, matchPoints?: number, isPublic?: boolean, timeControl?: string): Promise<Table> {
  return request<Table>("/api/tables", {
    method: "POST",
    body: JSON.stringify({
      player_id: playerId,
      preferred_color: preferredColor || null,
      match_points: matchPoints ?? 5,
      is_public: isPublic ?? false,
      time_control: timeControl ?? "unlimited",
    }),
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

/** Retrieve the paginated move-history log for a game played at `tableId`. */
export function getGameHistory(
  tableId: string,
  limit: number = 1000,
  offset: number = 0,
): Promise<PaginatedMoveHistory> {
  return request<PaginatedMoveHistory>(
    `/api/tables/${tableId}/history?limit=${limit}&offset=${offset}`,
  );
}

/** Retrieve full replay data (initial state + per-move snapshots) for a game. */
export function getReplay(tableId: string): Promise<ReplayData> {
  return request<ReplayData>(`/api/tables/${tableId}/replay`);
}

/**
 * Fetch a completed game as a standard backgammon notation string.
 *
 * The response is plain text (`.mat` format) rather than JSON, so this
 * uses a dedicated text-fetching helper instead of the shared `request`.
 */
async function requestText(path: string): Promise<string> {
  const headers: Record<string, string> = {};
  const token = getStoredToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(`${API_URL}${path}`, { headers });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "Unknown error" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.text();
}

/** Download the move history for `tableId` in standard backgammon notation. */
export function exportGame(tableId: string): Promise<string> {
  return requestText(`/api/tables/${tableId}/export`);
}

// ---------------------------------------------------------------------------
// Lobby / matchmaking
// ---------------------------------------------------------------------------

/** Fetch the list of public tables waiting for opponents. */
export function getLobby(): Promise<LobbyTable[]> {
  return request<LobbyTable[]>("/api/lobby");
}

/** Fetch the list of public tables with games currently in progress. */
export function getActiveGames(): Promise<ActiveGame[]> {
  return request<ActiveGame[]>("/api/active-games");
}

/** Join an available public table or create a new one. */
export function quickMatch(): Promise<Table> {
  return request<Table>("/api/quick-match", {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Leaderboard endpoints
// ---------------------------------------------------------------------------

/** Fetch the leaderboard sorted by the chosen metric. */
export function getLeaderboard(
  metric: "wins" | "win_rate" | "rating" = "wins",
  limit: number = 100,
  offset: number = 0,
): Promise<LeaderboardData> {
  return request<LeaderboardData>(
    `/api/leaderboard?metric=${metric}&limit=${limit}&offset=${offset}`,
  );
}

// ---------------------------------------------------------------------------
// Tournament endpoints
// ---------------------------------------------------------------------------

/** Fetch the list of all tournaments. */
export function listTournaments(): Promise<Tournament[]> {
  return request<Tournament[]>("/api/tournaments");
}

/** Create a new tournament. */
export function createTournament(name: string, maxPlayers: number, matchPoints: number): Promise<Tournament> {
  return request<Tournament>("/api/tournaments", {
    method: "POST",
    body: JSON.stringify({ name, max_players: maxPlayers, match_points: matchPoints }),
  });
}

/** Get tournament details including bracket. */
export function getTournament(tournamentId: string): Promise<TournamentBracket> {
  return request<TournamentBracket>(`/api/tournaments/${tournamentId}`);
}

/** Register the current player for a tournament. */
export function registerForTournament(tournamentId: string): Promise<TournamentBracket> {
  return request<TournamentBracket>(`/api/tournaments/${tournamentId}/register`, {
    method: "POST",
  });
}

/** Start a tournament (creator only). */
export function startTournament(tournamentId: string): Promise<TournamentBracket> {
  return request<TournamentBracket>(`/api/tournaments/${tournamentId}/start`, {
    method: "POST",
  });
}

/** Start the game table for a pending tournament match. */
export function startMatchTable(tournamentId: string, matchId: number): Promise<{ table_id: string }> {
  return request<{ table_id: string }>(`/api/tournaments/${tournamentId}/matches/${matchId}/start-table`, {
    method: "POST",
  });
}
