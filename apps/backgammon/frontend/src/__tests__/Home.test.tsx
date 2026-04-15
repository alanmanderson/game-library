/**
 * Tests for the Home component.
 *
 * Verifies rendering of the welcome message, action cards, bot difficulty
 * selector, color preference selector, join form, and navigation behavior.
 * API calls and React Router navigation are mocked.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Home from "../components/Home";
import type { Player } from "../types/game";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../services/api", () => ({
  createTable: vi.fn(),
  joinTable: vi.fn(),
  inviteBot: vi.fn(),
  getPlayerDashboard: vi.fn(),
  getLobby: vi.fn(),
  getActiveGames: vi.fn(),
  getLeaderboard: vi.fn(),
  listTournaments: vi.fn(),
  updateMyPreferences: vi.fn(),
  getMyChallenges: vi.fn(),
}));

// We need to dynamically import the mocked module so we can configure return values.
import * as api from "../services/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const registeredPlayer: Player = {
  id: "player-1",
  nickname: "TestUser",
  created_at: "2025-01-01T00:00:00",
  is_guest: false,
};

const guestPlayer: Player = {
  id: "guest-1",
  nickname: "GuestUser",
  created_at: "2025-01-01T00:00:00",
  is_guest: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: dashboard returns empty data
  vi.mocked(api.getPlayerDashboard).mockResolvedValue({
    total_games: 0,
    wins: 0,
    losses: 0,
    win_rate: 0,
    abandoned_games: 0,
    rating: 1500,
    rating_games: 0,
    games: [],
  });
  // Default: lobby returns empty data
  vi.mocked(api.getLobby).mockResolvedValue([]);
  vi.mocked(api.getActiveGames).mockResolvedValue([]);
  // Default: leaderboard returns empty data
  vi.mocked(api.getLeaderboard).mockResolvedValue({ entries: [], total: 0 });
  // Default: tournaments returns empty list
  vi.mocked(api.listTournaments).mockResolvedValue([]);
  // Default: challenges returns empty payload
  vi.mocked(api.getMyChallenges).mockResolvedValue({
    daily: [],
    weekly: [],
    challenge_points: 0,
  });
});

// ---------------------------------------------------------------------------
// Welcome message
// ---------------------------------------------------------------------------

describe("Home – welcome message", () => {
  it("renders a welcome message with the player nickname", () => {
    render(<Home player={registeredPlayer} />);
    expect(screen.getByText("TestUser")).toBeInTheDocument();
  });

  it("shows guest badge for guest players", () => {
    render(<Home player={guestPlayer} />);
    expect(screen.getByText("(Guest)")).toBeInTheDocument();
  });

  it("does not show guest badge for registered players", () => {
    render(<Home player={registeredPlayer} />);
    expect(screen.queryByText("(Guest)")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Action cards
// ---------------------------------------------------------------------------

describe("Home – action cards", () => {
  it("renders Play vs Bot, Create Game, and Join sections", () => {
    render(<Home player={registeredPlayer} />);
    expect(screen.getByText("Play vs Bot")).toBeInTheDocument();
    expect(screen.getByText("Create Game")).toBeInTheDocument();
    expect(screen.getByText("Join")).toBeInTheDocument();
  });

  it("renders the table ID input for Join Game", () => {
    render(<Home player={registeredPlayer} />);
    expect(screen.getByLabelText("Table code")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Bot difficulty selector
// ---------------------------------------------------------------------------

describe("Home – bot difficulty selector", () => {
  it("renders all difficulty levels", () => {
    render(<Home player={registeredPlayer} />);
    expect(screen.getByText("Easy")).toBeInTheDocument();
    expect(screen.getByText("Med")).toBeInTheDocument();
    expect(screen.getByText("Hard")).toBeInTheDocument();
    expect(screen.getByText("Expert")).toBeInTheDocument();
    expect(screen.getByText("GNU")).toBeInTheDocument();
  });

  it("selects GNU when the GNU button is clicked", () => {
    render(<Home player={registeredPlayer} />);
    const gnuBtn = screen.getByText("GNU");
    fireEvent.click(gnuBtn);
    expect(gnuBtn.classList.contains("selected")).toBe(true);
    expect(screen.getByText("Hard").classList.contains("selected")).toBe(false);
  });

  it("has Hard selected by default", () => {
    render(<Home player={registeredPlayer} />);
    const hardBtn = screen.getByText("Hard");
    expect(hardBtn.classList.contains("selected")).toBe(true);
  });

  it("selects a different difficulty when clicked", () => {
    render(<Home player={registeredPlayer} />);
    const easyBtn = screen.getByText("Easy");
    fireEvent.click(easyBtn);
    expect(easyBtn.classList.contains("selected")).toBe(true);
    expect(screen.getByText("Hard").classList.contains("selected")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Color preference selector
// ---------------------------------------------------------------------------

describe("Home – color preference selector", () => {
  it("renders White, Random, and Black color options", () => {
    render(<Home player={registeredPlayer} />);
    expect(screen.getByText("White")).toBeInTheDocument();
    expect(screen.getByText("Random")).toBeInTheDocument();
    expect(screen.getByText("Black")).toBeInTheDocument();
  });

  it("has Random selected by default", () => {
    render(<Home player={registeredPlayer} />);
    const randomBtn = screen.getByText("Random");
    expect(randomBtn.classList.contains("selected")).toBe(true);
  });

  it("selects White when the White button is clicked", () => {
    render(<Home player={registeredPlayer} />);
    fireEvent.click(screen.getByText("White"));
    expect(screen.getByText("White").classList.contains("selected")).toBe(true);
    expect(screen.getByText("Random").classList.contains("selected")).toBe(false);
  });

  it("toggles White back to Random when clicked again", () => {
    render(<Home player={registeredPlayer} />);
    const whiteBtn = screen.getByText("White");
    fireEvent.click(whiteBtn);
    expect(whiteBtn.classList.contains("selected")).toBe(true);
    fireEvent.click(whiteBtn);
    // White deselects, Random becomes selected
    expect(screen.getByText("Random").classList.contains("selected")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Match points selector
// ---------------------------------------------------------------------------

describe("Home – match points selector", () => {
  it("renders match point options", () => {
    render(<Home player={registeredPlayer} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("has 5 selected by default", () => {
    render(<Home player={registeredPlayer} />);
    // The "5" button in the config-pill-bar
    const buttons = screen.getAllByText("5");
    const matchBtn = buttons.find((b) => b.classList.contains("config-pill-option"));
    expect(matchBtn).toBeDefined();
    expect(matchBtn!.classList.contains("selected")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Create Table navigation
// ---------------------------------------------------------------------------

describe("Home – Create Table", () => {
  it("navigates to the game page on successful table creation", async () => {
    vi.mocked(api.createTable).mockResolvedValue({
      id: "ABC12345",
      status: "waiting",
      white_player: null,
      black_player: null,
      created_at: "2025-01-01T00:00:00",
      match_points: 5,
      white_match_score: 0,
      black_match_score: 0,
    });

    render(<Home player={registeredPlayer} />);
    fireEvent.click(screen.getByText("Create Game"));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/game/ABC12345");
    });
  });

  it("displays an error when table creation fails", async () => {
    vi.mocked(api.createTable).mockRejectedValue(new Error("Server error"));

    render(<Home player={registeredPlayer} />);
    fireEvent.click(screen.getByText("Create Game"));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Play vs Bot
// ---------------------------------------------------------------------------

describe("Home – Play vs Bot", () => {
  it("creates a table, invites bot, and navigates on success", async () => {
    const mockTable = {
      id: "BOT12345",
      status: "waiting",
      white_player: null,
      black_player: null,
      created_at: "2025-01-01T00:00:00",
      match_points: 5,
      white_match_score: 0,
      black_match_score: 0,
    };
    vi.mocked(api.createTable).mockResolvedValue(mockTable);
    vi.mocked(api.inviteBot).mockResolvedValue({
      ...mockTable,
      status: "playing",
    });

    render(<Home player={registeredPlayer} />);

    // Pick Easy difficulty
    fireEvent.click(screen.getByText("Easy"));

    // Click Play vs Bot button (inside .play-actions)
    const botButtons = screen.getAllByText("Play vs Bot");
    const actionButton = botButtons.find(
      (b) => b.tagName === "BUTTON" && b.closest(".play-actions"),
    );
    fireEvent.click(actionButton!);

    await waitFor(() => {
      expect(api.createTable).toHaveBeenCalled();
      expect(api.inviteBot).toHaveBeenCalledWith("BOT12345", "easy");
      expect(mockNavigate).toHaveBeenCalledWith("/game/BOT12345");
    });
  });
});

// ---------------------------------------------------------------------------
// Join Game
// ---------------------------------------------------------------------------

describe("Home – Join Game", () => {
  it("navigates to the game page after successfully joining", async () => {
    vi.mocked(api.joinTable).mockResolvedValue({
      id: "JOINABCD",
      status: "playing",
      white_player: null,
      black_player: null,
      created_at: "2025-01-01T00:00:00",
      match_points: 5,
      white_match_score: 0,
      black_match_score: 0,
    });

    render(<Home player={registeredPlayer} />);
    const input = screen.getByLabelText("Table code");
    fireEvent.change(input, { target: { value: "joinabcd" } });
    fireEvent.click(screen.getByText("Join"));

    await waitFor(() => {
      expect(api.joinTable).toHaveBeenCalledWith("JOINABCD", "player-1");
      expect(mockNavigate).toHaveBeenCalledWith("/game/JOINABCD");
    });
  });

  it("shows an error when trying to join with an empty table ID", async () => {
    render(<Home player={registeredPlayer} />);
    fireEvent.click(screen.getByText("Join"));

    await waitFor(() => {
      expect(screen.getByText("Please enter a table ID.")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Dashboard section
// ---------------------------------------------------------------------------

describe("Home – Dashboard section", () => {
  it("renders Dashboard tab for registered users", () => {
    render(<Home player={registeredPlayer} />);
    expect(screen.getByRole("tab", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("shows guest prompt when guest clicks Dashboard tab", () => {
    render(<Home player={guestPlayer} />);
    fireEvent.click(screen.getByRole("tab", { name: "Dashboard" }));
    expect(
      screen.getByText(/Create an account to track your stats/),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tabbed content
// ---------------------------------------------------------------------------

describe("Home – tabbed content", () => {
  it("renders all content tabs", () => {
    render(<Home player={registeredPlayer} />);
    expect(screen.getByRole("tab", { name: "Lobby" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Leaderboard" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tournaments" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Challenges" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Settings" })).toBeInTheDocument();
  });

  it("starts with Lobby tab active", () => {
    render(<Home player={registeredPlayer} />);
    const lobbyTab = screen.getByRole("tab", { name: "Lobby" });
    expect(lobbyTab.getAttribute("aria-selected")).toBe("true");
  });

  it("switches to Leaderboard tab on click", () => {
    render(<Home player={registeredPlayer} />);
    fireEvent.click(screen.getByRole("tab", { name: "Leaderboard" }));
    const leaderboardTab = screen.getByRole("tab", { name: "Leaderboard" });
    expect(leaderboardTab.getAttribute("aria-selected")).toBe("true");
  });
});
