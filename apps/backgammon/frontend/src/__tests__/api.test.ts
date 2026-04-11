/**
 * Tests for the frontend REST API service.
 *
 * Each function in ``services/api.ts`` is exercised with a mocked ``fetch``
 * so that no real network traffic is generated.  Both success and error paths
 * are covered.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createPlayer,
  getPlayer,
  getPlayerStats,
  createTable,
  joinTable,
  getTable,
  getGameHistory,
} from "../services/api";

// Allow assigning to global.fetch in tests
declare const global: typeof globalThis;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response-like object that the ``request`` wrapper expects. */
function mockOk(body: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  } as Response;
}

function mockError(status: number, detail: string) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ detail }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// createPlayer
// ---------------------------------------------------------------------------

describe("createPlayer", () => {
  it("sends a POST request with the nickname", async () => {
    const mockPlayer = {
      id: "abc-123",
      nickname: "Alice",
      created_at: "2025-01-01T00:00:00",
    };
    global.fetch = vi.fn().mockResolvedValue(mockOk(mockPlayer));

    const result = await createPlayer("Alice");

    expect(result).toEqual(mockPlayer);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/players"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ nickname: "Alice" }),
      }),
    );
  });

  it("throws on server error", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockError(500, "Internal server error"));

    await expect(createPlayer("Bad")).rejects.toThrow("Internal server error");
  });
});

// ---------------------------------------------------------------------------
// getPlayer
// ---------------------------------------------------------------------------

describe("getPlayer", () => {
  it("sends a GET request with the player ID in the URL", async () => {
    const mockPlayer = {
      id: "abc-123",
      nickname: "Alice",
      created_at: "2025-01-01T00:00:00",
    };
    global.fetch = vi.fn().mockResolvedValue(mockOk(mockPlayer));

    const result = await getPlayer("abc-123");

    expect(result).toEqual(mockPlayer);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/players/abc-123"),
      expect.any(Object),
    );
  });

  it("throws 'Not found' when the player does not exist", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockError(404, "Not found"));

    await expect(getPlayer("no-such-id")).rejects.toThrow("Not found");
  });
});

// ---------------------------------------------------------------------------
// getPlayerStats
// ---------------------------------------------------------------------------

describe("getPlayerStats", () => {
  it("fetches stats for the given player ID", async () => {
    const mockStats = {
      total_games: 5,
      total_wins: 3,
      total_losses: 2,
      win_rate: 60.0,
      per_opponent: [],
    };
    global.fetch = vi.fn().mockResolvedValue(mockOk(mockStats));

    const result = await getPlayerStats("player-42");

    expect(result).toEqual(mockStats);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/players/player-42/stats"),
      expect.any(Object),
    );
  });
});

// ---------------------------------------------------------------------------
// createTable
// ---------------------------------------------------------------------------

describe("createTable", () => {
  it("sends a POST with player_id in the body", async () => {
    const mockTable = {
      id: "ABCD12",
      status: "waiting",
      white_player: { id: "p1", nickname: "Alice", created_at: "" },
      black_player: null,
      created_at: "2025-01-01T00:00:00",
    };
    global.fetch = vi.fn().mockResolvedValue(mockOk(mockTable));

    const result = await createTable("p1");

    expect(result).toEqual(mockTable);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tables"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ player_id: "p1", preferred_color: null, match_points: 5 }),
      }),
    );
  });

  it("throws when the player ID is invalid", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockError(404, "Player not found"));

    await expect(createTable("bad-id")).rejects.toThrow("Player not found");
  });
});

// ---------------------------------------------------------------------------
// joinTable
// ---------------------------------------------------------------------------

describe("joinTable", () => {
  it("sends a POST to the join endpoint with player_id", async () => {
    const mockTable = {
      id: "ABCD12",
      status: "playing",
      white_player: { id: "p1", nickname: "Alice", created_at: "" },
      black_player: { id: "p2", nickname: "Bob", created_at: "" },
      created_at: "2025-01-01T00:00:00",
    };
    global.fetch = vi.fn().mockResolvedValue(mockOk(mockTable));

    const result = await joinTable("ABCD12", "p2");

    expect(result).toEqual(mockTable);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tables/ABCD12/join"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ player_id: "p2" }),
      }),
    );
  });

  it("throws when trying to join own table", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockError(400, "Cannot join your own table"));

    await expect(joinTable("ABCD12", "p1")).rejects.toThrow(
      "Cannot join your own table",
    );
  });
});

// ---------------------------------------------------------------------------
// getTable
// ---------------------------------------------------------------------------

describe("getTable", () => {
  it("fetches a table by ID", async () => {
    const mockTable = {
      id: "ABCD12",
      status: "waiting",
      white_player: null,
      black_player: null,
      created_at: "2025-01-01T00:00:00",
    };
    global.fetch = vi.fn().mockResolvedValue(mockOk(mockTable));

    const result = await getTable("ABCD12");

    expect(result).toEqual(mockTable);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tables/ABCD12"),
      expect.any(Object),
    );
  });

  it("throws when table is not found", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockError(404, "Table not found"));

    await expect(getTable("ZZZZZZ")).rejects.toThrow("Table not found");
  });
});

// ---------------------------------------------------------------------------
// getGameHistory
// ---------------------------------------------------------------------------

describe("getGameHistory", () => {
  it("fetches move history for a table", async () => {
    const mockHistory = [
      {
        move_number: 1,
        dice_roll: "3-1",
        moves_notation: "8/5 6/5",
        created_at: "2025-01-01T00:00:00",
      },
    ];
    global.fetch = vi.fn().mockResolvedValue(mockOk(mockHistory));

    const result = await getGameHistory("ABCD12");

    expect(result).toEqual(mockHistory);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tables/ABCD12/history"),
      expect.any(Object),
    );
  });

  it("returns empty array when no history exists", async () => {
    global.fetch = vi.fn().mockResolvedValue(mockOk([]));

    const result = await getGameHistory("NEW123");
    expect(result).toEqual([]);
  });

  it("handles unknown error gracefully", async () => {
    // Simulate a response where json() itself fails
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error("bad json")),
    } as unknown as Response);

    await expect(getGameHistory("BAD")).rejects.toThrow("Unknown error");
  });
});
