/**
 * Tests for the AnalysisMovesTab component.
 *
 * Verifies empty state, move-pair grouping, quality badge labels, equity-loss
 * display, active-move highlighting, jump-to-move interaction, dice roll
 * rendering, null quality, and edge cases (black-only row, very_good/very_bad
 * quality alias mapping, zero equity loss suppression).
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AnalysisMovesTab from "../components/AnalysisMovesTab";
import type { AnalysisMoveRecord } from "../types/game";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMove(
  overrides: Partial<AnalysisMoveRecord> & { move_number: number; player: "white" | "black" },
): AnalysisMoveRecord {
  return {
    dice_roll: "3-1",
    move_notation: "8/5 6/5",
    quality: null,
    equity_loss: null,
    annotation: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const mockJump = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("AnalysisMovesTab – empty state", () => {
  it("shows 'No moves yet' when moveHistory is empty", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText("No moves yet")).toBeInTheDocument();
  });

  it("does not render any rows when history is empty", () => {
    const { container } = render(
      <AnalysisMovesTab
        moveHistory={[]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(container.querySelectorAll(".analysis-moves__row")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Move pair rendering
// ---------------------------------------------------------------------------

describe("AnalysisMovesTab – move pair rendering", () => {
  const twoMoves: AnalysisMoveRecord[] = [
    makeMove({ move_number: 1, player: "white", dice_roll: "3-1", move_notation: "8/5 6/5" }),
    makeMove({ move_number: 2, player: "black", dice_roll: "6-4", move_notation: "1/7 12/16" }),
  ];

  it("renders both move notations", () => {
    render(
      <AnalysisMovesTab
        moveHistory={twoMoves}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText("8/5 6/5")).toBeInTheDocument();
    // Black's "1/7 12/16" is mirrored to Black's perspective: "24/18 13/9"
    expect(screen.getByText("24/18 13/9")).toBeInTheDocument();
  });

  it("renders dice rolls for each move", () => {
    render(
      <AnalysisMovesTab
        moveHistory={twoMoves}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText("3-1")).toBeInTheDocument();
    expect(screen.getByText("6-4")).toBeInTheDocument();
  });

  it("groups a white + black move into a single row", () => {
    const { container } = render(
      <AnalysisMovesTab
        moveHistory={twoMoves}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(container.querySelectorAll(".analysis-moves__row")).toHaveLength(1);
  });

  it("creates a separate row when black moves without a preceding white move", () => {
    const blackOnly: AnalysisMoveRecord[] = [
      makeMove({ move_number: 1, player: "black", dice_roll: "5-3", move_notation: "13/8 13/10" }),
    ];
    const { container } = render(
      <AnalysisMovesTab
        moveHistory={blackOnly}
        currentMoveIndex={-1}
        playerColor="black"
        onJumpToMove={mockJump}
      />,
    );
    expect(container.querySelectorAll(".analysis-moves__row")).toHaveLength(1);
    // Black's "13/8 13/10" is mirrored to Black's perspective: "12/17 12/15"
    expect(screen.getByText("12/17 12/15")).toBeInTheDocument();
  });

  it("renders the row number", () => {
    render(
      <AnalysisMovesTab
        moveHistory={twoMoves}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText("1.")).toBeInTheDocument();
  });

  it("renders multiple rows for many moves", () => {
    const moves: AnalysisMoveRecord[] = [
      makeMove({ move_number: 1, player: "white", move_notation: "24/21" }),
      makeMove({ move_number: 2, player: "black", move_notation: "1/4" }),
      makeMove({ move_number: 3, player: "white", move_notation: "13/10" }),
      makeMove({ move_number: 4, player: "black", move_notation: "12/15" }),
    ];
    const { container } = render(
      <AnalysisMovesTab
        moveHistory={moves}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(container.querySelectorAll(".analysis-moves__row")).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Quality badges
// ---------------------------------------------------------------------------

describe("AnalysisMovesTab – quality badges", () => {
  it("shows 'Best' for quality=best", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[makeMove({ move_number: 1, player: "white", quality: "best" })]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText(/Best/)).toBeInTheDocument();
  });

  it("shows 'Best' for quality=very_good (alias)", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[makeMove({ move_number: 1, player: "white", quality: "very_good" })]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText(/Best/)).toBeInTheDocument();
  });

  it("shows 'Inaccuracy' for quality=inaccuracy", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[makeMove({ move_number: 1, player: "white", quality: "inaccuracy" })]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText(/Inaccuracy/)).toBeInTheDocument();
  });

  it("shows 'Doubtful' for quality=doubtful", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[makeMove({ move_number: 1, player: "white", quality: "doubtful" })]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText(/Doubtful/)).toBeInTheDocument();
  });

  it("shows 'Mistake' for quality=mistake", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[makeMove({ move_number: 1, player: "white", quality: "mistake" })]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText(/Mistake/)).toBeInTheDocument();
  });

  it("shows 'Bad' for quality=bad", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[makeMove({ move_number: 1, player: "white", quality: "bad" })]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText(/Bad/)).toBeInTheDocument();
  });

  it("shows 'Blunder' for quality=blunder", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[makeMove({ move_number: 1, player: "white", quality: "blunder" })]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText(/Blunder/)).toBeInTheDocument();
  });

  it("shows 'Blunder' for quality=very_bad (alias)", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[makeMove({ move_number: 1, player: "white", quality: "very_bad" })]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText(/Blunder/)).toBeInTheDocument();
  });

  it("does not render a quality badge when quality is null", () => {
    const { container } = render(
      <AnalysisMovesTab
        moveHistory={[makeMove({ move_number: 1, player: "white", quality: null })]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(container.querySelectorAll(".analysis-moves__quality")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Equity loss
// ---------------------------------------------------------------------------

describe("AnalysisMovesTab – equity loss display", () => {
  it("shows equity loss value when > 0.001", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[
          makeMove({
            move_number: 1,
            player: "white",
            quality: "inaccuracy",
            equity_loss: 0.04,
          }),
        ]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.getByText(/0\.040/)).toBeInTheDocument();
  });

  it("suppresses equity loss display when value is 0", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[
          makeMove({
            move_number: 1,
            player: "white",
            quality: "best",
            equity_loss: 0,
          }),
        ]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    // Should not render a parenthesized loss
    expect(screen.queryByText(/\(.*\)/)).not.toBeInTheDocument();
  });

  it("suppresses equity loss display when value is exactly 0.001 (boundary)", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[
          makeMove({
            move_number: 1,
            player: "white",
            quality: "best",
            equity_loss: 0.001,
          }),
        ]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.queryByText(/0\.001/)).not.toBeInTheDocument();
  });

  it("suppresses equity loss display when equity_loss is null", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[
          makeMove({
            move_number: 1,
            player: "white",
            quality: "best",
            equity_loss: null,
          }),
        ]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(screen.queryByText(/\(.*\)/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

describe("AnalysisMovesTab – interaction", () => {
  const twoMoves: AnalysisMoveRecord[] = [
    makeMove({ move_number: 1, player: "white", dice_roll: "3-1", move_notation: "8/5 6/5" }),
    makeMove({ move_number: 2, player: "black", dice_roll: "6-4", move_notation: "1/7 12/16" }),
  ];

  it("calls onJumpToMove with the move_number when a white move is clicked", () => {
    render(
      <AnalysisMovesTab
        moveHistory={twoMoves}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    fireEvent.click(screen.getByText("8/5 6/5"));
    expect(mockJump).toHaveBeenCalledWith(1);
  });

  it("calls onJumpToMove with the move_number when a black move is clicked", () => {
    render(
      <AnalysisMovesTab
        moveHistory={twoMoves}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    // Black's "1/7 12/16" is displayed as "24/18 13/9"
    fireEvent.click(screen.getByText("24/18 13/9"));
    expect(mockJump).toHaveBeenCalledWith(2);
  });

  it("applies active class to the currently viewed move", () => {
    const { container } = render(
      <AnalysisMovesTab
        moveHistory={twoMoves}
        currentMoveIndex={0} // move_number=1 means index=0
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    const activeCells = container.querySelectorAll(".analysis-moves__row--active");
    expect(activeCells.length).toBeGreaterThan(0);
  });

  it("does not apply active class when currentMoveIndex is -1 (live position)", () => {
    const { container } = render(
      <AnalysisMovesTab
        moveHistory={twoMoves}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    expect(container.querySelectorAll(".analysis-moves__row--active")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Move notation fallback
// ---------------------------------------------------------------------------

describe("AnalysisMovesTab – notation fallback", () => {
  it("renders an em-dash when move_notation is empty string", () => {
    render(
      <AnalysisMovesTab
        moveHistory={[
          makeMove({ move_number: 1, player: "white", move_notation: "" }),
        ]}
        currentMoveIndex={-1}
        playerColor="white"
        onJumpToMove={mockJump}
      />,
    );
    // The component renders \u2014 (em dash) for empty notation
    expect(screen.getByText("\u2014")).toBeInTheDocument();
  });
});
