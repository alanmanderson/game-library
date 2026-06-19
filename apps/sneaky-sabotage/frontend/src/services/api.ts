import type {
  CreateGameResponse,
  JoinGameResponse,
  GetGameResponse,
} from "../types/game";

// ---------------------------------------------------------------------------
// Generic request helper
// ---------------------------------------------------------------------------

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    const body = await res.text();
    let message: string;
    try {
      const parsed = JSON.parse(body);
      message = parsed.detail ?? parsed.message ?? body;
    } catch {
      message = body;
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

export function createGame(
  playerName: string,
  timerSeconds?: number,
  maxRounds?: number,
): Promise<CreateGameResponse> {
  return request<CreateGameResponse>("/api/games", {
    method: "POST",
    body: JSON.stringify({
      player_name: playerName,
      timer_seconds: timerSeconds,
      max_rounds: maxRounds,
    }),
  });
}

export function joinGame(
  gameId: string,
  playerName: string,
): Promise<JoinGameResponse> {
  return request<JoinGameResponse>(`/api/games/${gameId}/join`, {
    method: "POST",
    body: JSON.stringify({ player_name: playerName }),
  });
}

export function getGame(gameId: string): Promise<GetGameResponse> {
  return request<GetGameResponse>(`/api/games/${gameId}`);
}
