/**
 * Tests for the AnalysisEvalTab component.
 *
 * Verifies the idle state, loading states for hints and eval, hint-candidate
 * list rendering, cube-action section, equity bar + probability table,
 * equity sign formatting, equity-diff display, and edge cases (no probs,
 * both hint and eval visible, equity at boundaries, empty candidates).
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AnalysisEvalTab from "../components/AnalysisEvalTab";
import type { AnalysisHintResult, AnalysisEvalResult } from "../types/game";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHint(overrides: Partial<AnalysisHintResult> = {}): AnalysisHintResult {
  return {
    cube_action: null,
    candidates: [],
    ...overrides,
  };
}

function makeEval(equity: number): AnalysisEvalResult {
  return {
    equity,
    probs: {
      win: 0.568,
      win_g: 0.168,
      win_bg: 0.008,
      lose_g: 0.110,
      lose_bg: 0.004,
    },
  };
}

// ---------------------------------------------------------------------------
// Idle (no data)
// ---------------------------------------------------------------------------

describe("AnalysisEvalTab – idle state", () => {
  it("shows H and E keyboard hint text when no data is loaded", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText(/Press/)).toBeInTheDocument();
    expect(screen.getByText(/for hints/i)).toBeInTheDocument();
  });

  it("does not show hint or eval sections when idle", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.queryByText("Best Moves")).not.toBeInTheDocument();
    expect(screen.queryByText("Position Evaluation")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Loading states
// ---------------------------------------------------------------------------

describe("AnalysisEvalTab – loading states", () => {
  it("shows 'Loading hints...' when hintLoading=true", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={null}
        hintLoading={true}
        evalLoading={false}
      />,
    );
    expect(screen.getByText("Loading hints...")).toBeInTheDocument();
  });

  it("hides the idle prompt when hints are loading", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={null}
        hintLoading={true}
        evalLoading={false}
      />,
    );
    // With hintLoading=true and no data the idle block condition is false
    // (hintLoading is truthy), so the prompt should not render.
    expect(screen.queryByText(/Press/)).not.toBeInTheDocument();
  });

  it("shows 'Evaluating position...' when evalLoading=true", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={null}
        hintLoading={false}
        evalLoading={true}
      />,
    );
    expect(screen.getByText("Evaluating position...")).toBeInTheDocument();
  });

  it("hides the idle prompt when eval is loading", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={null}
        hintLoading={false}
        evalLoading={true}
      />,
    );
    expect(screen.queryByText(/Press/)).not.toBeInTheDocument();
  });

  it("shows both loading messages when both are loading simultaneously", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={null}
        hintLoading={true}
        evalLoading={true}
      />,
    );
    expect(screen.getByText("Loading hints...")).toBeInTheDocument();
    expect(screen.getByText("Evaluating position...")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Hint candidates
// ---------------------------------------------------------------------------

describe("AnalysisEvalTab – hint candidates", () => {
  const hintWithCandidates: AnalysisHintResult = {
    cube_action: null,
    candidates: [
      { rank: 1, notation: "13/7 8/7", moves: [], equity: 0.324, equity_diff: 0, probs: null },
      { rank: 2, notation: "13/7 6/5", moves: [], equity: 0.289, equity_diff: -0.035, probs: null },
      { rank: 3, notation: "8/2 6/5", moves: [], equity: 0.270, equity_diff: -0.054, probs: null },
    ],
  };

  it("shows 'Best Moves' section heading", () => {
    render(
      <AnalysisEvalTab
        hint={hintWithCandidates}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText("Best Moves")).toBeInTheDocument();
  });

  it("renders all candidate notations", () => {
    render(
      <AnalysisEvalTab
        hint={hintWithCandidates}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText("13/7 8/7")).toBeInTheDocument();
    expect(screen.getByText("13/7 6/5")).toBeInTheDocument();
    expect(screen.getByText("8/2 6/5")).toBeInTheDocument();
  });

  it("renders rank numbers for each candidate", () => {
    render(
      <AnalysisEvalTab
        hint={hintWithCandidates}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
  });

  it("renders positive equity with a + prefix", () => {
    render(
      <AnalysisEvalTab
        hint={hintWithCandidates}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText("+0.324")).toBeInTheDocument();
  });

  it("renders equity without + prefix when negative", () => {
    const negHint: AnalysisHintResult = {
      cube_action: null,
      candidates: [
        { rank: 1, notation: "bar/20", moves: [], equity: -0.4, equity_diff: 0, probs: null },
      ],
    };
    render(
      <AnalysisEvalTab
        hint={negHint}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText("-0.400")).toBeInTheDocument();
  });

  it("shows equity diff for non-best candidates when diff < -0.001", () => {
    render(
      <AnalysisEvalTab
        hint={hintWithCandidates}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText("-0.035")).toBeInTheDocument();
  });

  it("does not show equity diff for the top candidate when diff is 0", () => {
    render(
      <AnalysisEvalTab
        hint={hintWithCandidates}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    // The first candidate has diff=0, so no diff element should appear for it.
    // We check that "-0.000" is not present (the top candidate diff formatted).
    expect(screen.queryByText("-0.000")).not.toBeInTheDocument();
  });

  it("does not show 'Best Moves' section when candidates list is empty", () => {
    render(
      <AnalysisEvalTab
        hint={makeHint({ candidates: [] })}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.queryByText("Best Moves")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Cube action
// ---------------------------------------------------------------------------

describe("AnalysisEvalTab – cube action", () => {
  const hintWithCube: AnalysisHintResult = {
    cube_action: {
      recommendation: "No Double / Take",
      equity_no_double: 0.324,
      equity_double_take: 0.289,
      equity_double_drop: 1.0,
    },
    candidates: [],
  };

  it("shows 'Cube Decision' section heading", () => {
    render(
      <AnalysisEvalTab
        hint={hintWithCube}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText("Cube Decision")).toBeInTheDocument();
  });

  it("renders the recommendation text", () => {
    render(
      <AnalysisEvalTab
        hint={hintWithCube}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText("No Double / Take")).toBeInTheDocument();
  });

  it("renders equity values for no-double, double-take, double-drop", () => {
    render(
      <AnalysisEvalTab
        hint={hintWithCube}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    // The formatted output includes the labels "No double:" and "D/T:" and "D/D:"
    expect(screen.getByText(/No double:.*0\.324/)).toBeInTheDocument();
    expect(screen.getByText(/D\/T:.*0\.289/)).toBeInTheDocument();
    expect(screen.getByText(/D\/D:.*1\.000/)).toBeInTheDocument();
  });

  it("does not show cube decision when cube_action is null", () => {
    render(
      <AnalysisEvalTab
        hint={makeHint({ cube_action: null, candidates: [
          { rank: 1, notation: "13/7 8/7", moves: [], equity: 0.3, equity_diff: 0, probs: null },
        ]})}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.queryByText("Cube Decision")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Position evaluation
// ---------------------------------------------------------------------------

describe("AnalysisEvalTab – position evaluation", () => {
  it("shows 'Position Evaluation' section heading", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={makeEval(0.324)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText("Position Evaluation")).toBeInTheDocument();
  });

  it("renders equity with + prefix for positive values", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={makeEval(0.324)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText(/Equity:.*\+0\.324/)).toBeInTheDocument();
  });

  it("renders equity without + prefix for negative values", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={makeEval(-0.45)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText(/Equity:.*-0\.450/)).toBeInTheDocument();
  });

  it("renders equity as +0.000 for exactly zero", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={makeEval(0)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText(/Equity:.*\+0\.000/)).toBeInTheDocument();
  });

  it("renders win probability as a percentage", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={makeEval(0.324)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    // 0.568 * 100 = 56.8%
    expect(screen.getByText("56.8%")).toBeInTheDocument();
  });

  it("renders all five probability columns in the table", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={makeEval(0.324)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText("Win")).toBeInTheDocument();
    expect(screen.getByText("W(G)")).toBeInTheDocument();
    expect(screen.getByText("W(BG)")).toBeInTheDocument();
    expect(screen.getByText("L(G)")).toBeInTheDocument();
    expect(screen.getByText("L(BG)")).toBeInTheDocument();
  });

  it("renders win-gammon probability", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={makeEval(0.324)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    // 0.168 * 100 = 16.8%
    expect(screen.getByText("16.8%")).toBeInTheDocument();
  });

  it("does not render probability table when probs is absent", () => {
    const evalNoProbs: AnalysisEvalResult = {
      equity: 0.2,
      probs: null as unknown as AnalysisEvalResult["probs"],
    };
    const { container } = render(
      <AnalysisEvalTab
        hint={null}
        evaluation={evalNoProbs}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(container.querySelector(".prob-table")).toBeNull();
  });

  it("renders an equity bar track element", () => {
    const { container } = render(
      <AnalysisEvalTab
        hint={null}
        evaluation={makeEval(0.5)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(container.querySelector(".equity-bar__track")).not.toBeNull();
  });

  it("equity bar fill is clamped to 0% at equity=-1.0", () => {
    const { container } = render(
      <AnalysisEvalTab
        hint={null}
        evaluation={makeEval(-1.0)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    const fill = container.querySelector(".equity-bar__fill") as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("equity bar fill is clamped to 100% at equity=+1.0", () => {
    const { container } = render(
      <AnalysisEvalTab
        hint={null}
        evaluation={makeEval(1.0)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    const fill = container.querySelector(".equity-bar__fill") as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("equity bar fill is at 50% at equity=0", () => {
    const { container } = render(
      <AnalysisEvalTab
        hint={null}
        evaluation={makeEval(0)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    const fill = container.querySelector(".equity-bar__fill") as HTMLElement;
    expect(fill.style.width).toBe("50%");
  });
});

// ---------------------------------------------------------------------------
// Both hint and eval simultaneously
// ---------------------------------------------------------------------------

describe("AnalysisEvalTab – hint and eval simultaneously", () => {
  it("renders both Best Moves and Position Evaluation sections", () => {
    const hint: AnalysisHintResult = {
      cube_action: null,
      candidates: [
        { rank: 1, notation: "13/7 8/7", moves: [], equity: 0.3, equity_diff: 0, probs: null },
      ],
    };
    render(
      <AnalysisEvalTab
        hint={hint}
        evaluation={makeEval(0.3)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.getByText("Best Moves")).toBeInTheDocument();
    expect(screen.getByText("Position Evaluation")).toBeInTheDocument();
  });

  it("does not show the idle prompt when hint data is present", () => {
    const hint: AnalysisHintResult = {
      cube_action: null,
      candidates: [
        { rank: 1, notation: "13/7 8/7", moves: [], equity: 0.3, equity_diff: 0, probs: null },
      ],
    };
    render(
      <AnalysisEvalTab
        hint={hint}
        evaluation={null}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.queryByText(/Press/)).not.toBeInTheDocument();
  });

  it("does not show the idle prompt when eval data is present", () => {
    render(
      <AnalysisEvalTab
        hint={null}
        evaluation={makeEval(0.1)}
        hintLoading={false}
        evalLoading={false}
      />,
    );
    expect(screen.queryByText(/Press/)).not.toBeInTheDocument();
  });
});
