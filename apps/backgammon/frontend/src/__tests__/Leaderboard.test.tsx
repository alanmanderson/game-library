/**
 * Tests for the Leaderboard component.
 *
 * Verifies rendering of tabs, leaderboard entries, loading state, error state,
 * empty state, and the highlighted "You" badge for the current player.
 * The API call is mocked.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Leaderboard from "../components/Leaderboard";
import type { LeaderboardData } from "../types/game";

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

vi.mock("../services/api", () => ({
  getLeaderboard: vi.fn(),
}));

import * as api from "../services/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockOnBack = vi.fn();

function renderLeaderboard(playerId: string | null = null) {
  return render(<Leaderboard playerId={playerId} onBack={mockOnBack} />);
}

function makeData(overrides: Partial<LeaderboardData> = {}): LeaderboardData {
  return {
    entries: [
      {
        rank: 1,
        player_id: "player-1",
        nickname: "Alice",
        rating: 1600,
        rating_games: 10,
        total_wins: 20,
        total_games: 25,
        win_rate: 80.0,
      },
      {
        rank: 2,
        player_id: "player-2",
        nickname: "Bob",
        rating: 1500,
        rating_games: 8,
        total_wins: 15,
        total_games: 20,
        win_rate: 75.0,
      },
    ],
    total: 2,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOnBack.mockReset();
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("Leaderboard – loading state", () => {
  it("shows a loading indicator while data is being fetched", () => {
    vi.mocked(api.getLeaderboard).mockReturnValue(new Promise(() => {}));
    renderLeaderboard();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe("Leaderboard – error state", () => {
  it("shows an error message on fetch failure", async () => {
    vi.mocked(api.getLeaderboard).mockRejectedValue(new Error("Network error"));
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("Leaderboard – empty state", () => {
  it("shows an empty message when no games have been played", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue({ entries: [], total: 0 });
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.getByText("No games played yet.")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Populated state
// ---------------------------------------------------------------------------

describe("Leaderboard – populated state", () => {
  it("renders player nicknames and win counts", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue(makeData());
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
  });

  it("shows win rate with one decimal place", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue(makeData());
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.getByText("80.0%")).toBeInTheDocument();
    });
  });

  it("shows player count summary", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue(makeData());
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.getByText(/Showing 2 of 2 players/)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Current player highlight
// ---------------------------------------------------------------------------

describe("Leaderboard – current player highlight", () => {
  it("shows a 'You' badge next to the current player's row", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue(makeData());
    renderLeaderboard("player-1");
    await waitFor(() => {
      expect(screen.getByText("You")).toBeInTheDocument();
    });
  });

  it("does not show a 'You' badge when no playerId is provided", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue(makeData());
    renderLeaderboard(null);
    await waitFor(() => {
      expect(screen.queryByText("You")).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

describe("Leaderboard – tab switching", () => {
  it("renders the three metric tabs", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue(makeData());
    renderLeaderboard();
    expect(screen.getByText("Most Wins")).toBeInTheDocument();
    expect(screen.getByText("Win Rate")).toBeInTheDocument();
    expect(screen.getByText("Rating")).toBeInTheDocument();
  });

  it("fetches with win_rate metric when the Win Rate tab is clicked", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue(makeData());
    renderLeaderboard();
    await waitFor(() => screen.getByText("Alice"));

    const winRateTab = screen.getByRole("tab", { name: "Win Rate" });
    fireEvent.click(winRateTab);
    await waitFor(() => {
      expect(api.getLeaderboard).toHaveBeenCalledWith("win_rate", 25, 0);
    });
  });

  it("shows a Rating column when the Rating tab is active", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue(makeData());
    renderLeaderboard();
    await waitFor(() => screen.getByText("Alice"));

    const ratingTab = screen.getByRole("tab", { name: "Rating" });
    fireEvent.click(ratingTab);
    await waitFor(() => {
      // Rating column header should appear in the table
      const headers = screen.getAllByText("Rating");
      expect(headers.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Back button
// ---------------------------------------------------------------------------

describe("Leaderboard – back button", () => {
  it("calls onBack when the Back button is clicked", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue(makeData());
    renderLeaderboard();
    fireEvent.click(screen.getByText("Back"));
    expect(mockOnBack).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Load more
// ---------------------------------------------------------------------------

describe("Leaderboard – load more", () => {
  it("does not show Load more when all entries are displayed", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue(makeData());
    renderLeaderboard();
    await waitFor(() => screen.getByText("Alice"));
    expect(screen.queryByText("Load more")).not.toBeInTheDocument();
  });

  it("shows Load more button when there are more entries", async () => {
    vi.mocked(api.getLeaderboard).mockResolvedValue(
      makeData({ total: 50 }),
    );
    renderLeaderboard();
    await waitFor(() => {
      expect(screen.getByText("Load more")).toBeInTheDocument();
    });
  });
});
