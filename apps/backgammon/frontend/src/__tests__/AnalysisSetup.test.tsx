/**
 * Tests for the AnalysisSetup component.
 *
 * Verifies rendering of the setup form, configuration controls, session
 * creation + navigation, recent-sessions list, error handling, loading state,
 * and the embedded-mode title suppression.
 * All API calls are mocked.
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AnalysisSetup from "../components/AnalysisSetup";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../services/api", () => ({
  createAnalysisSession: vi.fn(),
  listAnalysisSessions: vi.fn(),
}));

import * as api from "../services/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<{
  id: string;
  status: string;
  game_type: string;
  player_color: string;
  created_at: string;
}> = {}) {
  return {
    id: "ABC12345",
    player_id: "p1",
    game_type: "money",
    match_length: null,
    player_color: "white",
    gnubg_ply: 2,
    auto_analysis: "off",
    status: "active",
    result: null,
    loaded_from: null,
    created_at: "2024-01-01T00:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

const EMPTY_GAME_STATE = {
  points: Array(26).fill(0),
  bar_white: 0,
  bar_black: 0,
  off_white: 0,
  off_black: 0,
  current_turn: "white" as const,
  dice: null,
  remaining_dice: [],
  status: "rolling" as const,
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

function makeSessionResponse(sessionId: string) {
  return {
    session: makeSession({ id: sessionId }),
    game_state: EMPTY_GAME_STATE,
    move_count: 0,
    current_view_index: -1,
  };
}

function renderSetup(embedded?: boolean) {
  return render(
    <MemoryRouter>
      <AnalysisSetup embedded={embedded} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listAnalysisSessions).mockResolvedValue({ sessions: [] });
});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("AnalysisSetup – rendering", () => {
  it("renders the Start Analysis button", async () => {
    renderSetup();
    expect(screen.getByRole("button", { name: /start analysis/i })).toBeInTheDocument();
  });

  it("shows the Analysis Mode title by default", async () => {
    renderSetup();
    expect(screen.getByText("Analysis Mode")).toBeInTheDocument();
  });

  it("hides the title when embedded=true", async () => {
    renderSetup(true);
    expect(screen.queryByText("Analysis Mode")).not.toBeInTheDocument();
  });

  it("renders Play as selector with White, Random, Black options", async () => {
    renderSetup();
    expect(screen.getByRole("button", { name: /white/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /black/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /random/i })).toBeInTheDocument();
  });

  it("renders gnubg strength selector with 0-ply through 3-ply options", async () => {
    renderSetup();
    expect(screen.getByRole("button", { name: /0-ply/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1-ply/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2-ply/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3-ply/i })).toBeInTheDocument();
  });

  it("renders Auto analysis Off and Per turn options", async () => {
    renderSetup();
    expect(screen.getByRole("button", { name: /^off$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /per turn/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Config selection
// ---------------------------------------------------------------------------

describe("AnalysisSetup – configuration", () => {
  it("selects White as default player color", async () => {
    renderSetup();
    const whiteBtn = screen.getByRole("button", { name: /white/i });
    expect(whiteBtn.className).toContain("selected");
  });

  it("selects 2-ply as default gnubg strength", async () => {
    renderSetup();
    const plyBtn = screen.getByRole("button", { name: /2-ply/i });
    expect(plyBtn.className).toContain("selected");
  });

  it("selects Off as default auto analysis", async () => {
    renderSetup();
    const offBtn = screen.getByRole("button", { name: /^off$/i });
    expect(offBtn.className).toContain("selected");
  });

  it("switches player color to Black when clicked", async () => {
    renderSetup();
    fireEvent.click(screen.getByRole("button", { name: /black/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /black/i }).className).toContain("selected");
    });
  });

  it("switches player color to Random when clicked", async () => {
    renderSetup();
    fireEvent.click(screen.getByRole("button", { name: /random/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /random/i }).className).toContain("selected");
    });
  });

  it("switches ply to 0-ply when clicked", async () => {
    renderSetup();
    fireEvent.click(screen.getByRole("button", { name: /0-ply/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /0-ply/i }).className).toContain("selected");
    });
  });

  it("switches auto analysis to Per turn when clicked", async () => {
    renderSetup();
    fireEvent.click(screen.getByRole("button", { name: /per turn/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /per turn/i }).className).toContain("selected");
    });
  });
});

// ---------------------------------------------------------------------------
// Session creation
// ---------------------------------------------------------------------------

describe("AnalysisSetup – session creation", () => {
  it("calls createAnalysisSession and navigates to the new session", async () => {
    vi.mocked(api.createAnalysisSession).mockResolvedValue(
      makeSessionResponse("TEST1234"),
    );

    renderSetup();
    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(api.createAnalysisSession).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/analysis/TEST1234");
    });
  });

  it("passes the selected config to createAnalysisSession", async () => {
    vi.mocked(api.createAnalysisSession).mockResolvedValue(
      makeSessionResponse("SID1"),
    );

    renderSetup();
    // Switch to black, 1-ply, per turn
    fireEvent.click(screen.getByRole("button", { name: /black/i }));
    fireEvent.click(screen.getByRole("button", { name: /1-ply/i }));
    fireEvent.click(screen.getByRole("button", { name: /per turn/i }));
    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(api.createAnalysisSession).toHaveBeenCalledWith(
        expect.objectContaining({
          player_color: "black",
          gnubg_ply: 1,
          auto_analysis: "per_turn",
          game_type: "money",
        }),
      );
    });
  });

  it("disables the Start Analysis button while loading", async () => {
    vi.mocked(api.createAnalysisSession).mockReturnValue(new Promise(() => {}));

    renderSetup();
    const btn = screen.getByRole("button", { name: /start analysis/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /starting/i }),
      ).toBeDisabled();
    });
  });

  it("shows 'Starting...' text on the button while loading", async () => {
    vi.mocked(api.createAnalysisSession).mockReturnValue(new Promise(() => {}));

    renderSetup();
    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText("Starting...")).toBeInTheDocument();
    });
  });

  it("shows error message when createAnalysisSession rejects", async () => {
    vi.mocked(api.createAnalysisSession).mockRejectedValue(
      new Error("Server error"),
    );

    renderSetup();
    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("shows fallback error message when rejection is not an Error", async () => {
    vi.mocked(api.createAnalysisSession).mockRejectedValue("oops");

    renderSetup();
    fireEvent.click(screen.getByRole("button", { name: /start analysis/i }));

    await waitFor(() => {
      expect(screen.getByText("Failed to start")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Recent sessions
// ---------------------------------------------------------------------------

describe("AnalysisSetup – recent sessions", () => {
  it("does not show Resume Session section when there are no active sessions", async () => {
    vi.mocked(api.listAnalysisSessions).mockResolvedValue({ sessions: [] });
    renderSetup();
    await waitFor(() => {
      expect(screen.queryByText("Resume Session")).not.toBeInTheDocument();
    });
  });

  it("shows Resume Session heading and session ID when there is an active session", async () => {
    vi.mocked(api.listAnalysisSessions).mockResolvedValue({
      sessions: [makeSession({ id: "ABC123", status: "active" })],
    });

    renderSetup();
    await waitFor(() => {
      expect(screen.getByText("Resume Session")).toBeInTheDocument();
      expect(screen.getByText(/#ABC123/)).toBeInTheDocument();
    });
  });

  it("filters out non-active sessions from the recent list", async () => {
    vi.mocked(api.listAnalysisSessions).mockResolvedValue({
      sessions: [
        makeSession({ id: "ACTIVE1", status: "active" }),
        makeSession({ id: "CLOSED2", status: "closed" }),
      ],
    });

    renderSetup();
    await waitFor(() => {
      expect(screen.getByText(/#ACTIVE1/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/#CLOSED2/)).not.toBeInTheDocument();
  });

  it("shows at most 5 recent active sessions", async () => {
    vi.mocked(api.listAnalysisSessions).mockResolvedValue({
      sessions: Array.from({ length: 7 }, (_, i) =>
        makeSession({ id: `SID0000${i}`, status: "active" }),
      ),
    });

    renderSetup();
    await waitFor(() => {
      // First session must be visible
      expect(screen.getByText(/#SID00000/)).toBeInTheDocument();
    });
    // Session 6 (index 5) must not appear
    expect(screen.queryByText(/#SID00005/)).not.toBeInTheDocument();
  });

  it("navigates to the session when a recent item is clicked", async () => {
    vi.mocked(api.listAnalysisSessions).mockResolvedValue({
      sessions: [makeSession({ id: "JUMP01", status: "active" })],
    });

    renderSetup();
    await waitFor(() => screen.getByText(/#JUMP01/));

    fireEvent.click(screen.getByText(/#JUMP01/));

    expect(mockNavigate).toHaveBeenCalledWith("/analysis/JUMP01");
  });

  it("silently ignores errors from listAnalysisSessions", async () => {
    vi.mocked(api.listAnalysisSessions).mockRejectedValue(new Error("Forbidden"));
    // Should not throw; just renders with no recent sessions
    renderSetup();
    await waitFor(() => {
      expect(screen.queryByText("Resume Session")).not.toBeInTheDocument();
    });
  });
});
