/**
 * Tests for the GameControls component.
 *
 * Verifies that the correct buttons are shown based on game state,
 * turn ownership, and doubling cube state, and that click handlers
 * are invoked properly.
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import GameControls from "../components/GameControls";
import type { GameState, Color } from "../types/game";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal GameState with sensible defaults, overridable per-test. */
function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    points: Array(26).fill(0),
    bar_white: 0,
    bar_black: 0,
    off_white: 0,
    off_black: 0,
    current_turn: "white",
    dice: null,
    remaining_dice: [],
    status: "rolling",
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
    ...overrides,
  };
}

function makeHandlers() {
  return {
    onRollDice: vi.fn(),
    onEndTurn: vi.fn(),
    onUndoTurn: vi.fn(),
    onOfferDouble: vi.fn(),
    onAcceptDouble: vi.fn(),
    onDeclineDouble: vi.fn(),
    onResign: vi.fn(),
  };
}

function renderControls(
  gameStateOverrides: Partial<GameState> = {},
  myColor: Color = "white",
  opponentName: string = "Opponent",
) {
  const handlers = makeHandlers();
  const gameState = makeGameState(gameStateOverrides);
  const result = render(
    <GameControls
      gameState={gameState}
      myColor={myColor}
      opponentName={opponentName}
      onRequestHint={vi.fn()}
      hintsRemaining={3}
      {...handlers}
    />,
  );
  return { ...result, handlers, gameState };
}

// ---------------------------------------------------------------------------
// Roll button
// ---------------------------------------------------------------------------

describe("GameControls – Roll button", () => {
  it("renders when it is the player's turn and status is ROLLING", () => {
    renderControls({ current_turn: "white", status: "rolling" }, "white");
    expect(screen.getByText("Roll")).toBeInTheDocument();
  });

  it("does not render when it is not the player's turn", () => {
    renderControls({ current_turn: "black", status: "rolling" }, "white");
    expect(screen.queryByText("Roll")).not.toBeInTheDocument();
  });

  it("does not render when status is not ROLLING", () => {
    renderControls({ current_turn: "white", status: "moving" }, "white");
    expect(screen.queryByText("Roll")).not.toBeInTheDocument();
  });

  it("does not render when a double is offered", () => {
    renderControls(
      { current_turn: "white", status: "rolling", double_offered: true },
      "white",
    );
    expect(screen.queryByText("Roll")).not.toBeInTheDocument();
  });

  it("calls onRollDice when clicked", () => {
    const { handlers } = renderControls(
      { current_turn: "white", status: "rolling" },
      "white",
    );
    fireEvent.click(screen.getByText("Roll"));
    expect(handlers.onRollDice).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// End Turn / Confirm Turn buttons
// ---------------------------------------------------------------------------

describe("GameControls – End Turn button", () => {
  it("renders End Turn when no moves possible and remaining dice exist", () => {
    renderControls(
      {
        current_turn: "white",
        status: "moving",
        valid_moves: [],
        remaining_dice: [3, 5],
        turn_moves_count: 0,
      },
      "white",
    );
    expect(screen.getByText("End Turn")).toBeInTheDocument();
  });

  it("calls onEndTurn when End Turn is clicked", () => {
    const { handlers } = renderControls(
      {
        current_turn: "white",
        status: "moving",
        valid_moves: [],
        remaining_dice: [3, 5],
        turn_moves_count: 0,
      },
      "white",
    );
    fireEvent.click(screen.getByText("End Turn"));
    expect(handlers.onEndTurn).toHaveBeenCalledTimes(1);
  });

  it("does not render End Turn when it is not the player's turn", () => {
    renderControls(
      {
        current_turn: "black",
        status: "moving",
        valid_moves: [],
        remaining_dice: [3, 5],
        turn_moves_count: 0,
      },
      "white",
    );
    expect(screen.queryByText("End Turn")).not.toBeInTheDocument();
  });
});

describe("GameControls – Confirm Turn button", () => {
  it("renders when moves made and no remaining dice", () => {
    renderControls(
      {
        current_turn: "white",
        status: "moving",
        valid_moves: [],
        remaining_dice: [],
        turn_moves_count: 2,
      },
      "white",
    );
    expect(screen.getByText("Confirm Turn")).toBeInTheDocument();
  });

  it("renders when moves made and no valid moves left", () => {
    renderControls(
      {
        current_turn: "white",
        status: "moving",
        valid_moves: [],
        remaining_dice: [4],
        turn_moves_count: 1,
      },
      "white",
    );
    expect(screen.getByText("Confirm Turn")).toBeInTheDocument();
  });

  it("calls onEndTurn when Confirm Turn is clicked", () => {
    const { handlers } = renderControls(
      {
        current_turn: "white",
        status: "moving",
        valid_moves: [],
        remaining_dice: [],
        turn_moves_count: 2,
      },
      "white",
    );
    fireEvent.click(screen.getByText("Confirm Turn"));
    expect(handlers.onEndTurn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Undo button
// ---------------------------------------------------------------------------

describe("GameControls – Undo button", () => {
  it("renders when it is the player's turn and can_undo is true", () => {
    renderControls(
      { current_turn: "white", status: "moving", can_undo: true },
      "white",
    );
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });

  it("does not render when can_undo is false", () => {
    renderControls(
      { current_turn: "white", status: "moving", can_undo: false },
      "white",
    );
    expect(screen.queryByText("Undo")).not.toBeInTheDocument();
  });

  it("does not render when it is not the player's turn", () => {
    renderControls(
      { current_turn: "black", status: "moving", can_undo: true },
      "white",
    );
    expect(screen.queryByText("Undo")).not.toBeInTheDocument();
  });

  it("calls onUndoTurn when clicked", () => {
    const { handlers } = renderControls(
      { current_turn: "white", status: "moving", can_undo: true },
      "white",
    );
    fireEvent.click(screen.getByText("Undo"));
    expect(handlers.onUndoTurn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Double button
// ---------------------------------------------------------------------------

describe("GameControls – Double button", () => {
  it("renders when can_double is true and no double is offered", () => {
    renderControls({ can_double: true, double_offered: false }, "white");
    expect(screen.getByText("Double")).toBeInTheDocument();
  });

  it("does not render when can_double is false", () => {
    renderControls({ can_double: false }, "white");
    expect(screen.queryByText("Double")).not.toBeInTheDocument();
  });

  it("does not render when a double is already offered", () => {
    renderControls({ can_double: true, double_offered: true }, "white");
    expect(screen.queryByText("Double")).not.toBeInTheDocument();
  });

  it("calls onOfferDouble when clicked", () => {
    const { handlers } = renderControls(
      { can_double: true, double_offered: false },
      "white",
    );
    fireEvent.click(screen.getByText("Double"));
    expect(handlers.onOfferDouble).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Accept / Decline double buttons
// ---------------------------------------------------------------------------

describe("GameControls – Accept/Decline double buttons", () => {
  it("renders Accept and Decline when double offered by opponent", () => {
    renderControls(
      { double_offered: true, double_offered_by: "black" },
      "white",
    );
    expect(screen.getByText("Accept Double")).toBeInTheDocument();
    expect(screen.getByText("Decline Double")).toBeInTheDocument();
  });

  it("does not render Accept/Decline when double offered by self", () => {
    renderControls(
      { double_offered: true, double_offered_by: "white" },
      "white",
    );
    expect(screen.queryByText("Accept Double")).not.toBeInTheDocument();
    expect(screen.queryByText("Decline Double")).not.toBeInTheDocument();
  });

  it("does not render when no double is offered", () => {
    renderControls({ double_offered: false }, "white");
    expect(screen.queryByText("Accept Double")).not.toBeInTheDocument();
    expect(screen.queryByText("Decline Double")).not.toBeInTheDocument();
  });

  it("calls onAcceptDouble when Accept is clicked", () => {
    const { handlers } = renderControls(
      { double_offered: true, double_offered_by: "black" },
      "white",
    );
    fireEvent.click(screen.getByText("Accept Double"));
    expect(handlers.onAcceptDouble).toHaveBeenCalledTimes(1);
  });

  it("calls onDeclineDouble when Decline is clicked", () => {
    const { handlers } = renderControls(
      { double_offered: true, double_offered_by: "black" },
      "white",
    );
    fireEvent.click(screen.getByText("Decline Double"));
    expect(handlers.onDeclineDouble).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcut hint tooltips (title attributes)
// ---------------------------------------------------------------------------

describe("GameControls – keyboard shortcut hints", () => {
  it("Roll button has shortcut hint in title", () => {
    renderControls({ current_turn: "white", status: "rolling" }, "white");
    const btn = screen.getByText("Roll");
    expect(btn).toHaveAttribute("title");
    expect(btn.getAttribute("title")).toMatch(/R/);
  });

  it("End Turn button has shortcut hint in title", () => {
    renderControls(
      {
        current_turn: "white",
        status: "moving",
        valid_moves: [],
        remaining_dice: [3, 5],
        turn_moves_count: 0,
      },
      "white",
    );
    const btn = screen.getByText("End Turn");
    expect(btn).toHaveAttribute("title");
    expect(btn.getAttribute("title")).toMatch(/E/);
  });

  it("Confirm Turn button has shortcut hint in title", () => {
    renderControls(
      {
        current_turn: "white",
        status: "moving",
        valid_moves: [],
        remaining_dice: [],
        turn_moves_count: 2,
      },
      "white",
    );
    const btn = screen.getByText("Confirm Turn");
    expect(btn).toHaveAttribute("title");
    expect(btn.getAttribute("title")).toMatch(/E/);
  });

  it("Undo button has shortcut hint in title", () => {
    renderControls(
      { current_turn: "white", status: "moving", can_undo: true },
      "white",
    );
    const btn = screen.getByText("Undo");
    expect(btn).toHaveAttribute("title");
    expect(btn.getAttribute("title")).toMatch(/U/);
  });

  it("Double button has shortcut hint in title", () => {
    renderControls({ can_double: true, double_offered: false }, "white");
    const btn = screen.getByText("Double");
    expect(btn).toHaveAttribute("title");
    expect(btn.getAttribute("title")).toMatch(/D/);
  });
});

