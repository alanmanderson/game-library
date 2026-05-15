/**
 * Tests for the AdvancedStats component.
 *
 * Verifies that fetched advanced-stats data renders the expected headline
 * cards, win-rate bars by color + time control, cube stats, and rating
 * history graph. API call is mocked.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AdvancedStats from "../components/AdvancedStats";
import type { AdvancedStatsData } from "../types/game";

vi.mock("../services/api", () => ({
  getPlayerAdvancedStats: vi.fn(),
}));

import * as api from "../services/api";

const sampleStats: AdvancedStatsData = {
  total_games: 10,
  gammon_wins: 2,
  gammon_losses: 1,
  gammon_rate: 28.6,
  backgammon_wins: 1,
  backgammon_losses: 0,
  backgammon_rate: 14.3,
  win_rate_as_white: { games: 6, wins: 4, win_rate: 66.7 },
  win_rate_as_black: { games: 4, wins: 3, win_rate: 75.0 },
  win_rate_by_time_control: {
    blitz: { games: 4, wins: 3, win_rate: 75.0 },
    unlimited: { games: 6, wins: 4, win_rate: 66.7 },
  },
  cube_stats: {
    offered: 5,
    accepted: 3,
    declined: 2,
    accept_rate: 60.0,
    accuracy: 75.0,
    by_verdict: {
      best: 6,
      borderline: 1,
      mistake: 1,
      blunder: 0,
    },
  },
  rating_history: [
    { played_at: "2026-01-01T00:00:00", rating_after: 1500, rating_change: 0 },
    { played_at: "2026-01-02T00:00:00", rating_after: 1520, rating_change: 20 },
    { played_at: "2026-01-03T00:00:00", rating_after: 1535, rating_change: 15 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdvancedStats – loading state", () => {
  it("shows a loading indicator", () => {
    vi.mocked(api.getPlayerAdvancedStats).mockReturnValue(new Promise(() => {}));
    render(<AdvancedStats playerId="p1" />);
    expect(screen.getByText("Loading advanced stats...")).toBeInTheDocument();
  });
});

describe("AdvancedStats – empty state", () => {
  it("shows a hint when there are no games", async () => {
    vi.mocked(api.getPlayerAdvancedStats).mockResolvedValue({
      ...sampleStats,
      total_games: 0,
    });
    render(<AdvancedStats playerId="p1" />);
    await waitFor(() => {
      expect(
        screen.getByText(/Play a few games to unlock advanced stats/i),
      ).toBeInTheDocument();
    });
  });
});

describe("AdvancedStats – headline cards", () => {
  it("renders gammon, backgammon, and cube accept rate", async () => {
    vi.mocked(api.getPlayerAdvancedStats).mockResolvedValue(sampleStats);
    render(<AdvancedStats playerId="p1" />);
    await waitFor(() => {
      expect(screen.getByText("Gammon Rate")).toBeInTheDocument();
      expect(screen.getByText("Backgammon Rate")).toBeInTheDocument();
      expect(screen.getByText("Cube Accept Rate")).toBeInTheDocument();
      // The cube accept rate (60%) should be visible
      expect(screen.getByText("60%")).toBeInTheDocument();
    });
  });

  it("shows gammon won/lost breakdown", async () => {
    vi.mocked(api.getPlayerAdvancedStats).mockResolvedValue(sampleStats);
    render(<AdvancedStats playerId="p1" />);
    await waitFor(() => {
      expect(screen.getByText("2 won / 1 lost")).toBeInTheDocument();
    });
  });
});

describe("AdvancedStats – win rate bars", () => {
  it("renders per-color win rate rows", async () => {
    vi.mocked(api.getPlayerAdvancedStats).mockResolvedValue(sampleStats);
    render(<AdvancedStats playerId="p1" />);
    await waitFor(() => {
      expect(screen.getByText("As White")).toBeInTheDocument();
      expect(screen.getByText("As Black")).toBeInTheDocument();
    });
  });

  it("renders per-time-control win rate rows", async () => {
    vi.mocked(api.getPlayerAdvancedStats).mockResolvedValue(sampleStats);
    render(<AdvancedStats playerId="p1" />);
    await waitFor(() => {
      expect(screen.getByText("Blitz")).toBeInTheDocument();
      expect(screen.getByText("Unlimited")).toBeInTheDocument();
    });
  });
});

describe("AdvancedStats – rating graph", () => {
  it("renders a polyline with a dot per rating point", async () => {
    vi.mocked(api.getPlayerAdvancedStats).mockResolvedValue(sampleStats);
    const { container } = render(<AdvancedStats playerId="p1" />);
    await waitFor(() => {
      const polyline = container.querySelector("polyline.adv-rating-line");
      expect(polyline).not.toBeNull();
      const dots = container.querySelectorAll("circle.adv-rating-dot");
      expect(dots.length).toBe(3);
    });
  });

  it("shows an empty-rating message when no history exists", async () => {
    vi.mocked(api.getPlayerAdvancedStats).mockResolvedValue({
      ...sampleStats,
      rating_history: [],
    });
    render(<AdvancedStats playerId="p1" />);
    await waitFor(() => {
      expect(
        screen.getByText(/Play a rated match to start building/i),
      ).toBeInTheDocument();
    });
  });
});

describe("AdvancedStats – cube decision accuracy", () => {
  it("renders the cube accuracy card and verdict breakdown chips", async () => {
    vi.mocked(api.getPlayerAdvancedStats).mockResolvedValue(sampleStats);
    render(<AdvancedStats playerId="p1" />);
    await waitFor(() => {
      expect(screen.getByText("Cube Decision Accuracy")).toBeInTheDocument();
      expect(screen.getByText("Cube Decision Breakdown")).toBeInTheDocument();
      // Chip labels
      expect(screen.getByText("Best")).toBeInTheDocument();
      expect(screen.getByText("Borderline")).toBeInTheDocument();
      expect(screen.getByText("Mistake")).toBeInTheDocument();
      expect(screen.getByText("Blunder")).toBeInTheDocument();
      // Chip values for best/borderline/mistake/blunder.
      expect(screen.getAllByText("6").length).toBeGreaterThan(0);
    });
  });

  it("shows a 'Not enough data yet' hint when accuracy is null", async () => {
    vi.mocked(api.getPlayerAdvancedStats).mockResolvedValue({
      ...sampleStats,
      cube_stats: {
        ...sampleStats.cube_stats,
        accuracy: null,
        by_verdict: { best: 0, borderline: 0, mistake: 0, blunder: 0 },
      },
    });
    render(<AdvancedStats playerId="p1" />);
    await waitFor(() => {
      expect(screen.getByText(/Not enough data yet/i)).toBeInTheDocument();
      // The verdict chips section should NOT render in the null case.
      expect(
        screen.queryByText("Cube Decision Breakdown"),
      ).not.toBeInTheDocument();
    });
  });
});

describe("AdvancedStats – API integration", () => {
  it("calls getPlayerAdvancedStats with the provided player ID", async () => {
    vi.mocked(api.getPlayerAdvancedStats).mockResolvedValue(sampleStats);
    render(<AdvancedStats playerId="abc-123" />);
    await waitFor(() => {
      expect(api.getPlayerAdvancedStats).toHaveBeenCalledWith("abc-123");
    });
  });
});
