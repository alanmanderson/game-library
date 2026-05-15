/**
 * Tests for the AnalysisPanel component.
 *
 * Verifies tab rendering and switching, toolbar Hint/Eval buttons (enabled,
 * disabled, active state), navigation bar labels and button disabled states,
 * and correct sub-component rendering per active tab.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AnalysisPanel from "../components/AnalysisPanel";
import type { AnalysisSessionHook } from "../hooks/useAnalysisSession";
import type { AnalysisPanelTab } from "../types/game";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(
  overrides: Partial<AnalysisSessionHook> = {},
): AnalysisSessionHook {
  return {
    sessionId: "SID001",
    sessionStatus: "active",
    playerColor: "white",
    loading: false,
    error: null,
    clearError: vi.fn(),
    gameState: null,
    isLivePosition: true,
    currentMoveIndex: -1,
    totalMoves: 0,
    roll: vi.fn(),
    makeMove: vi.fn(),
    endTurn: vi.fn(),
    undoMove: vi.fn(),
    offerDouble: vi.fn(),
    respondToDouble: vi.fn(),
    hint: null,
    evaluation: null,
    getHint: vi.fn(),
    getEval: vi.fn(),
    hintLoading: false,
    evalLoading: false,
    navigateFirst: vi.fn(),
    navigatePrev: vi.fn(),
    navigateNext: vi.fn(),
    navigateLast: vi.fn(),
    jumpToMove: vi.fn(),
    moveHistory: [],
    refreshHistory: vi.fn(),
    annotateMove: vi.fn(),
    loadFromGame: vi.fn(),
    settings: { gnubg_ply: 2, auto_analysis: "off" },
    updateSettings: vi.fn(),
    createSession: vi.fn(),
    fetchSession: vi.fn(),
    ...overrides,
  };
}

function renderPanel(
  session: AnalysisSessionHook,
  activeTab: AnalysisPanelTab = "moves",
  onTabChange: (t: AnalysisPanelTab) => void = vi.fn(),
) {
  return render(
    <AnalysisPanel
      session={session}
      activeTab={activeTab}
      onTabChange={onTabChange}
    />,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tab bar rendering
// ---------------------------------------------------------------------------

describe("AnalysisPanel – tab bar", () => {
  it("renders Moves, Analysis, and Settings tabs", () => {
    renderPanel(makeSession());
    expect(screen.getByRole("button", { name: /^moves$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^analysis$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^settings$/i })).toBeInTheDocument();
  });

  it("marks the active tab with the active CSS class", () => {
    renderPanel(makeSession(), "moves");
    const movesTab = screen.getByRole("button", { name: /^moves$/i });
    expect(movesTab.className).toContain("analysis-panel__tab--active");
  });

  it("does not mark inactive tabs with the active CSS class", () => {
    renderPanel(makeSession(), "moves");
    const analysisTab = screen.getByRole("button", { name: /^analysis$/i });
    expect(analysisTab.className).not.toContain("analysis-panel__tab--active");
  });

  it("calls onTabChange with 'analysis' when Analysis tab is clicked", () => {
    const onTabChange = vi.fn();
    renderPanel(makeSession(), "moves", onTabChange);
    fireEvent.click(screen.getByRole("button", { name: /^analysis$/i }));
    expect(onTabChange).toHaveBeenCalledWith("analysis");
  });

  it("calls onTabChange with 'settings' when Settings tab is clicked", () => {
    const onTabChange = vi.fn();
    renderPanel(makeSession(), "moves", onTabChange);
    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    expect(onTabChange).toHaveBeenCalledWith("settings");
  });

  it("calls onTabChange with 'moves' when Moves tab is clicked", () => {
    const onTabChange = vi.fn();
    renderPanel(makeSession(), "analysis", onTabChange);
    fireEvent.click(screen.getByRole("button", { name: /^moves$/i }));
    expect(onTabChange).toHaveBeenCalledWith("moves");
  });
});

// ---------------------------------------------------------------------------
// Tab content
// ---------------------------------------------------------------------------

describe("AnalysisPanel – tab content", () => {
  it("renders moves tab content (No moves yet) when activeTab=moves", () => {
    renderPanel(makeSession(), "moves");
    expect(screen.getByText("No moves yet")).toBeInTheDocument();
  });

  it("renders analysis tab content when activeTab=analysis", () => {
    renderPanel(makeSession(), "analysis");
    // The eval tab idle state shows this text
    expect(screen.getByText(/Press/)).toBeInTheDocument();
  });

  it("renders settings tab content when activeTab=settings", () => {
    renderPanel(makeSession(), "settings");
    expect(screen.getByText(/Evaluation depth/i)).toBeInTheDocument();
  });

  it("does not render moves content when activeTab=analysis", () => {
    renderPanel(makeSession(), "analysis");
    expect(screen.queryByText("No moves yet")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Toolbar buttons
// ---------------------------------------------------------------------------

describe("AnalysisPanel – toolbar", () => {
  it("renders Hint and Eval toolbar buttons", () => {
    renderPanel(makeSession());
    expect(screen.getByRole("button", { name: /hint/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /eval/i })).toBeInTheDocument();
  });

  it("calls session.getHint when Hint button is clicked", () => {
    const session = makeSession();
    renderPanel(session);
    fireEvent.click(screen.getByRole("button", { name: /hint/i }));
    expect(session.getHint).toHaveBeenCalledTimes(1);
  });

  it("calls session.getEval when Eval button is clicked", () => {
    const session = makeSession();
    renderPanel(session);
    fireEvent.click(screen.getByRole("button", { name: /eval/i }));
    expect(session.getEval).toHaveBeenCalledTimes(1);
  });

  it("disables Hint button when hintLoading=true", () => {
    const { container } = renderPanel(makeSession({ hintLoading: true }));
    // When loading the button text changes to "...", accessible name becomes "... H"
    const hintBtn = container.querySelector(".analysis-panel__toolbar-btn");
    expect(hintBtn).not.toBeNull();
    expect(hintBtn).toBeDisabled();
  });

  it("disables Eval button when evalLoading=true", () => {
    const { container } = renderPanel(makeSession({ evalLoading: true }));
    const toolbarBtns = container.querySelectorAll(".analysis-panel__toolbar-btn");
    // Second toolbar button is Eval
    expect(toolbarBtns[1]).toBeDisabled();
  });

  it("shows '...' on Hint button when hintLoading=true", () => {
    const { container } = renderPanel(makeSession({ hintLoading: true }));
    const hintBtn = container.querySelector(".analysis-panel__toolbar-btn");
    expect(hintBtn?.textContent).toContain("...");
  });

  it("shows '...' on Eval button when evalLoading=true", () => {
    const { container } = renderPanel(makeSession({ evalLoading: true }));
    const toolbarBtns = container.querySelectorAll(".analysis-panel__toolbar-btn");
    expect(toolbarBtns[1].textContent).toContain("...");
  });

  it("applies active class to Hint button when hint data is present", () => {
    const session = makeSession({
      hint: { cube_action: null, candidates: [] },
    });
    renderPanel(session);
    const btn = screen.getByRole("button", { name: /hint/i });
    expect(btn.className).toContain("analysis-panel__toolbar-btn--active");
  });

  it("applies active class to Eval button when evaluation data is present", () => {
    const session = makeSession({
      evaluation: {
        equity: 0.1,
        probs: { win: 0.5, win_g: 0.1, win_bg: 0.01, lose_g: 0.1, lose_bg: 0.01 },
      },
    });
    renderPanel(session);
    const btn = screen.getByRole("button", { name: /eval/i });
    expect(btn.className).toContain("analysis-panel__toolbar-btn--active");
  });

  it("does not apply active class to Hint button when hint is null", () => {
    renderPanel(makeSession({ hint: null }));
    const btn = screen.getByRole("button", { name: /hint/i });
    expect(btn.className).not.toContain("analysis-panel__toolbar-btn--active");
  });
});

// ---------------------------------------------------------------------------
// Navigation bar
// ---------------------------------------------------------------------------

describe("AnalysisPanel – navigation bar", () => {
  it("shows 'Live (N moves)' label when currentMoveIndex is -1", () => {
    renderPanel(makeSession({ currentMoveIndex: -1, totalMoves: 5 }));
    expect(screen.getByText("Live (5 moves)")).toBeInTheDocument();
  });

  it("shows 'Move X / Y' label when viewing a historical position", () => {
    renderPanel(makeSession({ currentMoveIndex: 2, totalMoves: 10 }));
    expect(screen.getByText("Move 3 / 10")).toBeInTheDocument();
  });

  it("disables all navigation buttons when totalMoves=0", () => {
    const { container } = renderPanel(makeSession({ totalMoves: 0, currentMoveIndex: -1 }));
    const navBtns = container.querySelectorAll(".analysis-nav__btn");
    expect(navBtns.length).toBeGreaterThan(0);
    // First (First) and Prev buttons disabled when totalMoves=0
    expect(navBtns[0]).toBeDisabled();
    expect(navBtns[1]).toBeDisabled();
  });

  it("disables Next and Latest buttons when at live position (currentMoveIndex=-1)", () => {
    const { container } = renderPanel(
      makeSession({ totalMoves: 5, currentMoveIndex: -1 }),
    );
    const navBtns = container.querySelectorAll(".analysis-nav__btn");
    // Next is index 2, Latest is index 3
    expect(navBtns[2]).toBeDisabled();
    expect(navBtns[3]).toBeDisabled();
  });

  it("enables First and Prev buttons when viewing a historical position", () => {
    const { container } = renderPanel(
      makeSession({ totalMoves: 5, currentMoveIndex: 2 }),
    );
    const navBtns = container.querySelectorAll(".analysis-nav__btn");
    // totalMoves > 0 so First and Prev should be enabled
    expect(navBtns[0]).not.toBeDisabled();
    expect(navBtns[1]).not.toBeDisabled();
  });

  it("calls session.navigateFirst when First button is clicked", () => {
    const session = makeSession({ totalMoves: 5, currentMoveIndex: 2 });
    const { container } = renderPanel(session);
    const navBtns = container.querySelectorAll(".analysis-nav__btn");
    fireEvent.click(navBtns[0]);
    expect(session.navigateFirst).toHaveBeenCalledTimes(1);
  });

  it("calls session.navigatePrev when Prev button is clicked", () => {
    const session = makeSession({ totalMoves: 5, currentMoveIndex: 2 });
    const { container } = renderPanel(session);
    const navBtns = container.querySelectorAll(".analysis-nav__btn");
    fireEvent.click(navBtns[1]);
    expect(session.navigatePrev).toHaveBeenCalledTimes(1);
  });

  it("calls session.navigateNext when Next button is clicked", () => {
    const session = makeSession({ totalMoves: 5, currentMoveIndex: 2 });
    const { container } = renderPanel(session);
    const navBtns = container.querySelectorAll(".analysis-nav__btn");
    fireEvent.click(navBtns[2]);
    expect(session.navigateNext).toHaveBeenCalledTimes(1);
  });

  it("calls session.navigateLast when Latest button is clicked", () => {
    const session = makeSession({ totalMoves: 5, currentMoveIndex: 2 });
    const { container } = renderPanel(session);
    const navBtns = container.querySelectorAll(".analysis-nav__btn");
    fireEvent.click(navBtns[3]);
    expect(session.navigateLast).toHaveBeenCalledTimes(1);
  });
});
