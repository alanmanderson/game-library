/**
 * Tests for the Dashboard component.
 *
 * Verifies rendering of stats summary (wins, losses, win rate),
 * game history table, loading state, error state, and empty state.
 * The API call is mocked.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Dashboard from "../components/Dashboard";
import type { DashboardData } from "../types/game";

/** Render Dashboard inside a router context. */
function renderDashboard(playerId: string) {
  return render(
    <MemoryRouter>
      <Dashboard playerId={playerId} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

vi.mock("../services/api", () => ({
  getPlayerDashboard: vi.fn(),
}));

import * as api from "../services/api";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const dashboardWithGames: DashboardData = {
  total_games: 10,
  wins: 7,
  losses: 3,
  win_rate: 70,
  abandoned_games: 1,
  rating: 1500,
  rating_games: 10,
  games: [
    {
      table_id: "TABLE001",
      opponent_nickname: "Alice",
      player_color: "white",
      result: "win",
      win_type: "normal",
      score: 1,
      played_at: "2025-03-15T10:00:00",
      table_status: "finished",
    },
    {
      table_id: "TABLE002",
      opponent_nickname: "Bob",
      player_color: "black",
      result: "loss",
      win_type: "gammon",
      score: 2,
      played_at: "2025-03-14T10:00:00",
      table_status: "finished",
    },
    {
      table_id: "TABLE003",
      opponent_nickname: "Charlie",
      player_color: "white",
      result: "abandoned",
      win_type: null,
      score: null,
      played_at: "2025-03-13T10:00:00",
      table_status: "playing",
    },
  ],
};

const emptyDashboard: DashboardData = {
  total_games: 0,
  wins: 0,
  losses: 0,
  win_rate: 0,
  abandoned_games: 0,
  rating: 1500,
  rating_games: 0,
  games: [],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("Dashboard – loading state", () => {
  it("shows a loading indicator while data is being fetched", () => {
    // Never resolve so the component stays in loading state
    vi.mocked(api.getPlayerDashboard).mockReturnValue(new Promise(() => {}));
    renderDashboard("player-1");
    expect(screen.getByText("Loading dashboard...")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe("Dashboard – error state", () => {
  it("displays the error message when the API call fails", async () => {
    vi.mocked(api.getPlayerDashboard).mockRejectedValue(
      new Error("Network error"),
    );
    renderDashboard("player-1");

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("Dashboard – empty state", () => {
  it("shows 'No games played yet' when there are zero games", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(emptyDashboard);
    renderDashboard("player-1");

    await waitFor(() => {
      expect(screen.getByText("No games played yet.")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Stats summary
// ---------------------------------------------------------------------------

describe("Dashboard – stats summary", () => {
  it("renders the correct total games", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    renderDashboard("player-1");

    await waitFor(() => {
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("Games Played")).toBeInTheDocument();
    });
  });

  it("renders the correct number of wins", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    renderDashboard("player-1");

    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
      expect(screen.getByText("Wins")).toBeInTheDocument();
    });
  });

  it("renders the correct number of losses", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    renderDashboard("player-1");

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("Losses")).toBeInTheDocument();
    });
  });

  it("renders the win rate as a percentage", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    renderDashboard("player-1");

    await waitFor(() => {
      expect(screen.getByText("70%")).toBeInTheDocument();
      expect(screen.getByText("Win Rate")).toBeInTheDocument();
    });
  });

  it("renders the number of abandoned games", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    renderDashboard("player-1");

    await waitFor(() => {
      // The stat label "Abandoned" in the overview section
      const statLabels = screen.getAllByText("Abandoned");
      const overviewLabel = statLabels.find(
        (el) => el.classList.contains("stat-label"),
      );
      expect(overviewLabel).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Game history table
// ---------------------------------------------------------------------------

describe("Dashboard – game history table", () => {
  it("renders the history table with correct column headers", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    renderDashboard("player-1");

    await waitFor(() => {
      expect(screen.getByText("Date")).toBeInTheDocument();
      expect(screen.getByText("Opponent")).toBeInTheDocument();
      expect(screen.getByText("Color")).toBeInTheDocument();
      expect(screen.getByText("Result")).toBeInTheDocument();
      expect(screen.getByText("Win Type")).toBeInTheDocument();
      expect(screen.getByText("Score")).toBeInTheDocument();
    });
  });

  it("renders opponent nicknames in the table", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    renderDashboard("player-1");

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });
  });

  it("renders result badges (Win, Loss, Resume)", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    const { container } = renderDashboard("player-1");

    await waitFor(() => {
      const badges = container.querySelectorAll(".result-badge");
      expect(badges.length).toBe(3);

      const badgeTexts = Array.from(badges).map((b) => b.textContent);
      expect(badgeTexts).toContain("Win");
      expect(badgeTexts).toContain("Loss");
      // Abandoned game with table_status "playing" shows as Resume
      expect(badgeTexts).toContain("Resume");
    });
  });

  it("renders formatted win types (Normal, Gammon)", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    renderDashboard("player-1");

    await waitFor(() => {
      expect(screen.getByText("Normal")).toBeInTheDocument();
      expect(screen.getByText("Gammon")).toBeInTheDocument();
    });
  });

  it("shows '-' for win type on abandoned games", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    const { container } = renderDashboard("player-1");

    await waitFor(() => {
      // The abandoned game (Charlie) row should have "-" for win type and score
      const rows = container.querySelectorAll("tbody tr");
      expect(rows.length).toBe(3);
      // Third row is the abandoned game
      const cells = rows[2].querySelectorAll("td");
      // Win Type cell (index 4) and Score cell (index 5) should be "-"
      expect(cells[4].textContent).toBe("-");
      expect(cells[5].textContent).toBe("-");
    });
  });

  it("shows 'Replay' column header", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    renderDashboard("player-1");

    await waitFor(() => {
      expect(screen.getByText("Replay")).toBeInTheDocument();
    });
  });

  it("renders a Replay button for finished games", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    const { container } = renderDashboard("player-1");

    await waitFor(() => {
      const replayBtns = container.querySelectorAll(".replay-link-btn");
      // TABLE001 (win, finished) and TABLE002 (loss, finished) get replay buttons
      expect(replayBtns.length).toBe(2);
    });
  });

  it("does not render a Replay button for abandoned games", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    const { container } = renderDashboard("player-1");

    await waitFor(() => {
      const rows = container.querySelectorAll("tbody tr");
      // Third row is Charlie (abandoned)
      const charlieReplay = rows[2].querySelector(".replay-link-btn");
      expect(charlieReplay).toBeNull();
    });
  });

  it("renders game scores in the table", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(dashboardWithGames);
    const { container } = renderDashboard("player-1");

    await waitFor(() => {
      const rows = container.querySelectorAll("tbody tr");
      expect(rows.length).toBe(3);
      // First row: Alice, score = 1
      const aliceCells = rows[0].querySelectorAll("td");
      expect(aliceCells[5].textContent).toBe("1");
      // Second row: Bob, score = 2
      const bobCells = rows[1].querySelectorAll("td");
      expect(bobCells[5].textContent).toBe("2");
    });
  });
});

// ---------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------

describe("Dashboard – API integration", () => {
  it("calls getPlayerDashboard with the correct player ID", async () => {
    vi.mocked(api.getPlayerDashboard).mockResolvedValue(emptyDashboard);
    renderDashboard("some-player-id");

    await waitFor(() => {
      expect(api.getPlayerDashboard).toHaveBeenCalledWith("some-player-id");
    });
  });
});
