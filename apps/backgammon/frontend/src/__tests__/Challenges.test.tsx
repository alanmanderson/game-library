/**
 * Tests for the Challenges component.
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Challenges from "../components/Challenges";
import type { Player, ChallengesData } from "../types/game";

vi.mock("../services/api", () => ({
  getMyChallenges: vi.fn(),
}));

import * as api from "../services/api";

const registeredPlayer: Player = {
  id: "p1",
  nickname: "Reg",
  created_at: "2025-01-01T00:00:00",
  is_guest: false,
};

const guestPlayer: Player = {
  id: "g1",
  nickname: "Guest",
  created_at: "2025-01-01T00:00:00",
  is_guest: true,
};

const sampleData: ChallengesData = {
  daily: [
    {
      id: "daily_play_3",
      name: "Play 3 Games",
      description: "Play any 3 games today.",
      type: "daily",
      target: 3,
      metric: "games",
      reward_points: 10,
      progress: 1,
      completed_at: null,
      period_key: "2026-04-14",
    },
    {
      id: "daily_win_2",
      name: "Win 2 Games",
      description: "Win 2 games today.",
      type: "daily",
      target: 2,
      metric: "wins",
      reward_points: 25,
      progress: 2,
      completed_at: "2026-04-14T10:00:00Z",
      period_key: "2026-04-14",
    },
  ],
  weekly: [
    {
      id: "weekly_play_10",
      name: "Play 10 Games",
      description: "Play 10 games this week.",
      type: "weekly",
      target: 10,
      metric: "games",
      reward_points: 50,
      progress: 4,
      completed_at: null,
      period_key: "2026-W15",
    },
  ],
  challenge_points: 85,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Challenges", () => {
  it("shows a sign-in prompt for guest players and does not call API", () => {
    render(<Challenges player={guestPlayer} />);
    expect(screen.getByText("Sign in to earn rewards")).toBeInTheDocument();
    expect(api.getMyChallenges).not.toHaveBeenCalled();
  });

  it("renders daily + weekly challenge cards with progress", async () => {
    vi.mocked(api.getMyChallenges).mockResolvedValue(sampleData);
    render(<Challenges player={registeredPlayer} />);

    await waitFor(() => {
      expect(screen.getByText("Play 3 Games")).toBeInTheDocument();
    });
    expect(screen.getByText("Win 2 Games")).toBeInTheDocument();
    expect(screen.getByText("Play 10 Games")).toBeInTheDocument();
    expect(screen.getByText("Daily")).toBeInTheDocument();
    expect(screen.getByText("Weekly")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
    // Progress text "1 / 3" for daily_play_3
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("marks completed challenges with a checkmark and modifier class", async () => {
    vi.mocked(api.getMyChallenges).mockResolvedValue(sampleData);
    render(<Challenges player={registeredPlayer} />);

    await waitFor(() => {
      expect(screen.getByText("Win 2 Games")).toBeInTheDocument();
    });
    const completedCard = screen.getByTestId("challenge-daily_win_2");
    expect(completedCard.classList.contains("challenge-card--complete")).toBe(
      true,
    );
    expect(completedCard.querySelector(".challenge-card-check")).not.toBeNull();

    const openCard = screen.getByTestId("challenge-daily_play_3");
    expect(openCard.classList.contains("challenge-card--complete")).toBe(false);
    expect(openCard.querySelector(".challenge-card-check")).toBeNull();
  });

  it("displays reward points badge and per-card reward values", async () => {
    vi.mocked(api.getMyChallenges).mockResolvedValue(sampleData);
    render(<Challenges player={registeredPlayer} />);

    await waitFor(() => {
      expect(screen.getByText("Play 3 Games")).toBeInTheDocument();
    });
    expect(screen.getByText("+10 pts")).toBeInTheDocument();
    expect(screen.getByText("+25 pts")).toBeInTheDocument();
    expect(screen.getByText("+50 pts")).toBeInTheDocument();
  });

  it("renders an error message when the API fails", async () => {
    vi.mocked(api.getMyChallenges).mockRejectedValue(new Error("Network down"));
    render(<Challenges player={registeredPlayer} />);

    await waitFor(() => {
      expect(screen.getByText("Network down")).toBeInTheDocument();
    });
  });

  it("shows empty-state messages when no challenges are active", async () => {
    vi.mocked(api.getMyChallenges).mockResolvedValue({
      daily: [],
      weekly: [],
      challenge_points: 0,
    });
    render(<Challenges player={registeredPlayer} />);

    await waitFor(() => {
      expect(screen.getByText("Daily")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/No daily challenges right now\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No weekly challenges right now\./),
    ).toBeInTheDocument();
  });
});
