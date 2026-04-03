// ============================================================
// API Service - All game-related API endpoints
// ============================================================

import type {
  GameState,
  GameListItem,
  DayResult,
  SupplyPrices,
  LocationOption,
} from '@/types/game';

const BASE = (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL : '') + '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${text}`);
  }
  // Handle 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Game management
  newGame(playerName: string): Promise<GameState> {
    return request(`${BASE}/game/new`, {
      method: 'POST',
      body: JSON.stringify({ playerName }),
    });
  },

  getGame(id: string): Promise<GameState> {
    return request(`${BASE}/game/${id}`);
  },

  listGames(): Promise<GameListItem[]> {
    return request(`${BASE}/game`);
  },

  deleteGame(id: string): Promise<void> {
    return request(`${BASE}/game/${id}`, { method: 'DELETE' });
  },

  // Gameplay
  advanceDay(id: string): Promise<DayResult> {
    return request(`${BASE}/game/${id}/advance-day`, { method: 'POST' });
  },

  buySupplies(
    id: string,
    supplies: { cups: number; lemons: number; sugar: number; ice: number; water: number },
  ): Promise<GameState> {
    return request(`${BASE}/game/${id}/buy-supplies`, {
      method: 'POST',
      body: JSON.stringify(supplies),
    });
  },

  setRecipe(
    id: string,
    data: { standId: string; waterRatio: number; lemonRatio: number; sugarRatio: number; iceRatio: number },
  ): Promise<GameState> {
    return request(`${BASE}/game/${id}/set-recipe`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  setPrice(id: string, data: { standId: string; price: number }): Promise<GameState> {
    return request(`${BASE}/game/${id}/set-price`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  openStand(
    id: string,
    data: { locationName: string; locationType: string },
  ): Promise<GameState> {
    return request(`${BASE}/game/${id}/open-stand`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  hireEmployee(id: string, data: { name: string; role: string }): Promise<GameState> {
    return request(`${BASE}/game/${id}/hire-employee`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getLocations(id: string): Promise<LocationOption[]> {
    return request(`${BASE}/game/${id}/locations`);
  },

  getPrices(id: string): Promise<SupplyPrices> {
    return request(`${BASE}/game/${id}/prices`);
  },
};
