/**
 * Tests for the SeasonHistory component rendered inside the Dashboard.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SeasonHistory from "../components/SeasonHistory";
import type { PlayerSeasonHistoryEntry } from "../types/game";

vi.mock("../services/api", () => ({
  getPlayerSeasonHistory: vi.fn(),
}));

import * as api from "../services/api";

const activeSeason: PlayerSeasonHistoryEntry = {
  season_id: 2,
  season_name: "Spring 2026",
  start_date: "2026-03-01T00:00:00Z",
  end_date: "2026-05-31T23:59:59Z",
  is_active: true,
  end_rating: 1650,
  peak_rating: 1700,
  wins: 8,
  losses: 4,
  gammons_won: 2,
  gammons_lost: 1,
  tier_final: "Gold",
  games_played: 12,
  updated_at: "2026-04-14T10:00:00Z",
};

const finishedSeason: PlayerSeasonHistoryEntry = {
  season_id: 1,
  season_name: "Winter 2025",
  start_date: "2025-12-01T00:00:00Z",
  end_date: "2026-02-28T23:59:59Z",
  is_active: false,
  end_rating: 1500,
  peak_rating: 1540,
  wins: 5,
  losses: 6,
  gammons_won: 1,
  gammons_lost: 2,
  tier_final: "Silver",
  games_played: 11,
  updated_at: "2026-02-28T20:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SeasonHistory – empty state", () => {
  it("renders the empty message when the API returns no entries", async () => {
    vi.mocked(api.getPlayerSeasonHistory).mockResolvedValue([]);
    render(<SeasonHistory playerId="player-1" />);

    await waitFor(() => {
      expect(
        screen.getByText(/No season history yet/i),
      ).toBeInTheDocument();
    });
  });

  it("shows a loading state while fetching", () => {
    vi.mocked(api.getPlayerSeasonHistory).mockReturnValue(
      new Promise(() => {}),
    );
    render(<SeasonHistory playerId="player-1" />);
    expect(screen.getByText(/Loading season history/i)).toBeInTheDocument();
  });
});

describe("SeasonHistory – rendered cards", () => {
  it("renders one card per season with ratings and record", async () => {
    vi.mocked(api.getPlayerSeasonHistory).mockResolvedValue([
      activeSeason,
      finishedSeason,
    ]);
    const { container } = render(<SeasonHistory playerId="player-1" />);

    await waitFor(() => {
      const cards = container.querySelectorAll(".season-card");
      expect(cards.length).toBe(2);
    });

    expect(screen.getByText("Spring 2026")).toBeInTheDocument();
    expect(screen.getByText("Winter 2025")).toBeInTheDocument();
    expect(screen.getByText("1650")).toBeInTheDocument(); // end rating
    expect(screen.getByText("1700")).toBeInTheDocument(); // peak rating
    expect(screen.getByText("8-4")).toBeInTheDocument(); // record
    expect(screen.getByText("5-6")).toBeInTheDocument();
  });

  it("highlights the active season with the modifier class and label", async () => {
    vi.mocked(api.getPlayerSeasonHistory).mockResolvedValue([
      activeSeason,
      finishedSeason,
    ]);
    const { container } = render(<SeasonHistory playerId="player-1" />);

    await waitFor(() => {
      expect(
        container.querySelector(".season-card--active"),
      ).not.toBeNull();
    });

    const activeCard = container.querySelector(".season-card--active");
    expect(activeCard?.textContent).toContain("Spring 2026");
    expect(
      screen.getByText(/Current season \(in progress\)/i),
    ).toBeInTheDocument();
  });

  it("renders the highest tier as a peak badge", async () => {
    vi.mocked(api.getPlayerSeasonHistory).mockResolvedValue([
      activeSeason,
      finishedSeason,
    ]);
    render(<SeasonHistory playerId="player-1" />);

    await waitFor(() => {
      // activeSeason is Gold, finishedSeason is Silver → peak is Gold.
      expect(screen.getByText(/Peak tier: Gold/i)).toBeInTheDocument();
    });
  });

  it("renders gammon W/L per season", async () => {
    vi.mocked(api.getPlayerSeasonHistory).mockResolvedValue([activeSeason]);
    render(<SeasonHistory playerId="player-1" />);

    await waitFor(() => {
      expect(screen.getByText("2W / 1L")).toBeInTheDocument();
    });
  });
});
