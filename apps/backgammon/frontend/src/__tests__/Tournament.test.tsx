/**
 * Tests for TournamentDetail — covers the "Join Game" label, match-ready
 * banner, and the polling lifecycle. API and react-router are mocked.
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TournamentDetail } from "../components/Tournament";
import type { Player, TournamentBracket, TournamentMatch } from "../types/game";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ tournamentId: "t1" }),
}));

vi.mock("../services/api", () => ({
  getTournament: vi.fn(),
  registerForTournament: vi.fn(),
  startTournament: vi.fn(),
  startMatchTable: vi.fn(),
}));

import * as api from "../services/api";

const me: Player = {
  id: "p1",
  nickname: "Alice",
  created_at: "2025-01-01T00:00:00",
  is_guest: false,
};

const opponent: Player = {
  id: "p2",
  nickname: "Bob",
  created_at: "2025-01-01T00:00:00",
  is_guest: false,
};

function buildBracket(overrides: Partial<TournamentMatch> = {}): TournamentBracket {
  const match: TournamentMatch = {
    id: 1,
    round_number: 1,
    match_number: 1,
    player1_id: me.id,
    player1_nickname: me.nickname,
    player2_id: opponent.id,
    player2_nickname: opponent.nickname,
    table_id: null,
    winner_id: null,
    status: "pending",
    ...overrides,
  };
  return {
    tournament: {
      id: "t1",
      name: "Spring Open",
      max_players: 4,
      match_points: 3,
      status: "in_progress",
      created_by: me.id,
      created_at: "2025-01-01T00:00:00",
      winner_id: null,
      winner_nickname: null,
      player_count: 2,
    },
    entries: [
      { id: 1, player_id: me.id, player_nickname: me.nickname, seed: 1, eliminated: false },
      { id: 2, player_id: opponent.id, player_nickname: opponent.nickname, seed: 2, eliminated: false },
    ],
    matches: [match],
    total_rounds: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TournamentDetail — match-ready affordances", () => {
  it("shows 'Join Game' on the bracket and a match-ready banner when the viewer's match is playing", async () => {
    vi.mocked(api.getTournament).mockResolvedValue(
      buildBracket({ status: "playing", table_id: "TBL12345" }),
    );

    render(<TournamentDetail player={me} />);

    await screen.findByText("Spring Open");
    expect(screen.getByRole("button", { name: /join game/i })).toBeTruthy();
    // Match-ready banner with opponent name — banner has role="status"
    const banner = screen.getByRole("status");
    expect(banner.textContent).toMatch(/your match vs/i);
    expect(banner.textContent).toContain("Bob");
    expect(screen.getByRole("button", { name: /join now/i })).toBeTruthy();
  });

  it("navigates to /game/<id> when the banner's Join Now button is clicked", async () => {
    vi.mocked(api.getTournament).mockResolvedValue(
      buildBracket({ status: "playing", table_id: "TBL12345" }),
    );

    render(<TournamentDetail player={me} />);
    const joinNow = await screen.findByRole("button", { name: /join now/i });
    fireEvent.click(joinNow);
    expect(mockNavigate).toHaveBeenCalledWith("/game/TBL12345");
  });

  it("navigates to /game/<id> when the bracket's Join Game button is clicked", async () => {
    vi.mocked(api.getTournament).mockResolvedValue(
      buildBracket({ status: "playing", table_id: "TBL99999" }),
    );

    render(<TournamentDetail player={me} />);
    const joinGame = await screen.findByRole("button", { name: /join game/i });
    fireEvent.click(joinGame);
    expect(mockNavigate).toHaveBeenCalledWith("/game/TBL99999");
  });

  it("shows 'Watch' (not 'Join Game') and no banner for non-participants viewing a live match", async () => {
    const stranger: Player = { ...me, id: "p99", nickname: "Stranger" };
    vi.mocked(api.getTournament).mockResolvedValue(
      buildBracket({ status: "playing", table_id: "TBL12345" }),
    );

    render(<TournamentDetail player={stranger} />);
    await screen.findByText("Spring Open");
    expect(screen.getByRole("button", { name: /watch/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /join now/i })).toBeNull();
    expect(screen.queryByText(/your match vs/i)).toBeNull();
  });

  it("does not render the banner when the user has no active match (e.g. already eliminated)", async () => {
    vi.mocked(api.getTournament).mockResolvedValue(
      buildBracket({ status: "completed", winner_id: opponent.id, table_id: "TBL1" }),
    );
    render(<TournamentDetail player={me} />);
    await screen.findByText("Spring Open");
    expect(screen.queryByRole("button", { name: /join now/i })).toBeNull();
  });
});

describe("TournamentDetail — polling", () => {
  it("polls getTournament while the viewer has a pending match", async () => {
    vi.useFakeTimers();
    vi.mocked(api.getTournament).mockResolvedValue(buildBracket({ status: "pending" }));
    render(<TournamentDetail player={me} />);
    // Flush the initial load's promise so the bracket renders and the polling
    // useEffect fires, scheduling its setInterval against fake timers.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(api.getTournament).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(api.getTournament).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(api.getTournament).toHaveBeenCalledTimes(3);
  });

  it("does not poll for spectators (no active match for this viewer)", async () => {
    const stranger: Player = { ...me, id: "p99", nickname: "Stranger" };
    vi.mocked(api.getTournament).mockResolvedValue(buildBracket({ status: "pending" }));
    render(<TournamentDetail player={stranger} />);
    await screen.findByText("Spring Open");
    expect(api.getTournament).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(api.getTournament).toHaveBeenCalledTimes(1);
  });

  it("stops polling when the user's matches are all completed", async () => {
    vi.mocked(api.getTournament).mockResolvedValue(
      buildBracket({ status: "completed", winner_id: opponent.id }),
    );
    render(<TournamentDetail player={me} />);
    await screen.findByText("Spring Open");
    expect(api.getTournament).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(api.getTournament).toHaveBeenCalledTimes(1);
  });

  it("pauses polling while the tab is hidden and resumes when visible", async () => {
    vi.mocked(api.getTournament).mockResolvedValue(buildBracket({ status: "pending" }));
    render(<TournamentDetail player={me} />);
    await screen.findByText("Spring Open");
    expect(api.getTournament).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    // Hide the tab
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(api.getTournament).toHaveBeenCalledTimes(1);

    // Show the tab again
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(api.getTournament).toHaveBeenCalledTimes(2);
  });
});

describe("TournamentDetail — error states", () => {
  it("renders an error when getTournament fails", async () => {
    vi.mocked(api.getTournament).mockRejectedValue(new Error("boom"));
    render(<TournamentDetail player={me} />);
    await waitFor(() => {
      expect(screen.getByText(/boom/i)).toBeTruthy();
    });
  });
});
