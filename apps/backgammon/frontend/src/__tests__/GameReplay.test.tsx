/**
 * Tests for the GameReplay component.
 *
 * Verifies loading state, error state, initial board rendering,
 * and navigation controls (previous/next/first/last move).
 * The API call is mocked.
 */

import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GameReplay from "../components/GameReplay";
import type { ReplayData } from "../types/game";

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

vi.mock("../services/api", () => ({
  getReplay: vi.fn(),
}));

import * as api from "../services/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render the GameReplay component at /replay/:tableId inside a router. */
function renderReplay(tableId: string, search: string = "") {
  return render(
    <MemoryRouter initialEntries={[`/replay/${tableId}${search}`]}>
      <Routes>
        <Route path="/replay/:tableId" element={<GameReplay />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  points: [0, -2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2, 0],
  bar_white: 0,
  bar_black: 0,
  off_white: 0,
  off_black: 0,
  current_turn: "white" as const,
  dice: null,
  remaining_dice: [],
  status: "waiting" as const,
  valid_moves: [],
  winner: null,
  win_type: null,
  opening_roll: null,
  turn_moves_count: 0,
  can_undo: false,
  cube_value: 1,
  cube_owner: null,
  double_offered: false,
  double_offered_by: null,
  can_double: false,
  is_crawford_game: false,
};

const STATE_AFTER_MOVE1 = {
  ...INITIAL_STATE,
  points: [0, -2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2, 0],
  current_turn: "black" as const,
  status: "rolling" as const,
};

const STATE_AFTER_MOVE2 = {
  ...STATE_AFTER_MOVE1,
  current_turn: "white" as const,
};

const replayWithMoves: ReplayData = {
  table_id: "TABLE001",
  status: "finished",
  white_player_nickname: "Alice",
  black_player_nickname: "Bob",
  winner_color: "white",
  winner_nickname: "Alice",
  win_type: "gammon",
  final_score: 2,
  white_match_score: 3,
  black_match_score: 1,
  match_points: 5,
  initial_state: INITIAL_STATE,
  moves: [
    {
      move_number: 1,
      player_nickname: "Alice",
      dice_roll: "3-5",
      moves_notation: "13/8 8/5",
      game_state_after: STATE_AFTER_MOVE1,
      created_at: "2025-03-15T10:00:00",
    },
    {
      move_number: 2,
      player_nickname: "Bob",
      dice_roll: "2-4",
      moves_notation: "24/22 24/20",
      game_state_after: STATE_AFTER_MOVE2,
      created_at: "2025-03-15T10:01:00",
    },
  ],
};

const replayNoMoves: ReplayData = {
  table_id: "TABLE002",
  status: "finished",
  white_player_nickname: "Alice",
  black_player_nickname: "Bob",
  winner_color: null,
  winner_nickname: null,
  win_type: null,
  initial_state: INITIAL_STATE,
  moves: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GameReplay – loading state", () => {
  it("shows a loading indicator while data is being fetched", () => {
    vi.mocked(api.getReplay).mockReturnValue(new Promise(() => {})); // never resolves
    renderReplay("TABLE001");
    expect(screen.getByText(/loading replay/i)).toBeInTheDocument();
  });
});

describe("GameReplay – error state", () => {
  it("shows an error message when the fetch fails", async () => {
    vi.mocked(api.getReplay).mockRejectedValue(new Error("Not found"));
    renderReplay("TABLE001");
    await waitFor(() => {
      expect(screen.getByText("Not found")).toBeInTheDocument();
    });
  });

  it("shows a Back button on error", async () => {
    vi.mocked(api.getReplay).mockRejectedValue(new Error("Oops"));
    renderReplay("TABLE001");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
    });
  });
});

describe("GameReplay – initial position", () => {
  it("renders player names in the title", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => {
      expect(screen.getByText(/Alice.*Bob|Bob.*Alice/)).toBeInTheDocument();
    });
  });

  it("shows 'Starting position' when at move 0", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => {
      expect(screen.getByText("Starting position")).toBeInTheDocument();
    });
  });

  it("shows correct total move count", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => screen.getByText("Starting position"));

    // Navigate to move 1 so the counter shows "Move 1 of 2"
    fireEvent.click(screen.getByRole("button", { name: /next move/i }));

    await waitFor(() => {
      const counter = document.querySelector(".replay-counter");
      expect(counter?.textContent).toContain("of");
      expect(counter?.textContent).toContain("2");
    });
  });

  it("disables previous/first buttons at move 0", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /go to first move/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /previous move/i })).toBeDisabled();
    });
  });
});

describe("GameReplay – navigation", () => {
  it("advances to move 1 when Next is clicked", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => screen.getByText("Starting position"));

    fireEvent.click(screen.getByRole("button", { name: /next move/i }));

    await waitFor(() => {
      const counter = document.querySelector(".replay-counter");
      expect(counter?.textContent).toContain("1");
    });
  });

  it("shows move notation after navigating forward", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => screen.getByText("Starting position"));

    fireEvent.click(screen.getByRole("button", { name: /next move/i }));

    await waitFor(() => {
      expect(screen.getByText("13/8 8/5")).toBeInTheDocument();
    });
  });

  it("shows dice for current move", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => screen.getByText("Starting position"));

    fireEvent.click(screen.getByRole("button", { name: /next move/i }));

    await waitFor(() => {
      // The dice element contains "🎲 3-5"; check it contains "3-5"
      const diceEl = document.querySelector(".replay-dice");
      expect(diceEl?.textContent).toContain("3-5");
    });
  });

  it("goes to last move when Last button is clicked", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => screen.getByText("Starting position"));

    fireEvent.click(screen.getByRole("button", { name: /go to last move/i }));

    await waitFor(() => {
      const counter = document.querySelector(".replay-counter");
      expect(counter?.textContent).toContain("2");
      expect(counter?.textContent).not.toContain("Starting");
    });
  });

  it("goes back to move 0 when First button is clicked", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => screen.getByText("Starting position"));

    fireEvent.click(screen.getByRole("button", { name: /go to last move/i }));
    await waitFor(() => {
      const counter = document.querySelector(".replay-counter");
      expect(counter?.textContent).not.toContain("Starting");
    });

    fireEvent.click(screen.getByRole("button", { name: /go to first move/i }));
    await waitFor(() => {
      expect(screen.getByText("Starting position")).toBeInTheDocument();
    });
  });

  it("disables Next/Last buttons at final move", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => screen.getByText("Starting position"));

    fireEvent.click(screen.getByRole("button", { name: /go to last move/i }));
    await waitFor(() => {
      const counter = document.querySelector(".replay-counter");
      expect(counter?.textContent).not.toContain("Starting");
    });

    expect(screen.getByRole("button", { name: /go to last move/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next move/i })).toBeDisabled();
  });
});

describe("GameReplay – share link", () => {
  it("renders a Copy Share Link button", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /copy share link/i }),
      ).toBeInTheDocument();
    });
  });

  it("copies the canonical replay URL to the clipboard and shows feedback", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderReplay("TABLE001");
    const btn = await screen.findByRole("button", { name: /copy share link/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const calledWith = writeText.mock.calls[0][0] as string;
    expect(calledWith.endsWith("/replay/TABLE001")).toBe(true);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copy share link/i })).toHaveTextContent(
        /copied/i,
      );
    });
  });
});

describe("GameReplay – embed mode", () => {
  it("hides the header (title, back, share) when ?embed=1", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001", "?embed=1");
    // Wait for the board to appear so we know loading is done
    await waitFor(() => screen.getByText("Starting position"));
    expect(screen.queryByRole("button", { name: /copy share link/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^back$/i })).toBeNull();
    expect(screen.queryByText(/Alice vs Bob/)).toBeNull();
  });

  it("applies the embed CSS modifier class", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    const { container } = renderReplay("TABLE001", "?embed=1");
    await waitFor(() => screen.getByText("Starting position"));
    expect(container.querySelector(".replay-page--embed")).not.toBeNull();
  });

  it("still shows the header when embed param is missing", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copy share link/i })).toBeInTheDocument();
    });
  });
});

describe("GameReplay – OG meta tags", () => {
  it("sets document.title and og meta tags based on replay data", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayWithMoves);
    renderReplay("TABLE001");
    await waitFor(() => {
      expect(document.title).toContain("Alice");
      expect(document.title).toContain("Bob");
    });
    const ogTitle = document.head.querySelector('meta[property="og:title"]');
    const ogDesc = document.head.querySelector('meta[property="og:description"]');
    const ogType = document.head.querySelector('meta[property="og:type"]');
    expect(ogTitle?.getAttribute("content")).toContain("Alice");
    expect(ogDesc?.getAttribute("content")).toContain("Alice");
    expect(ogType?.getAttribute("content")).toBe("website");
  });
});

describe("GameReplay – no moves", () => {
  it("shows 'Starting position' when there are no moves", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayNoMoves);
    renderReplay("TABLE002");
    await waitFor(() => {
      expect(screen.getByText("Starting position")).toBeInTheDocument();
    });
  });

  it("disables all navigation buttons when there are no moves", async () => {
    vi.mocked(api.getReplay).mockResolvedValue(replayNoMoves);
    renderReplay("TABLE002");
    await waitFor(() => screen.getByText("Starting position"));

    expect(screen.getByRole("button", { name: /go to first move/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /previous move/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next move/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /go to last move/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /auto-play/i })).toBeDisabled();
  });
});
