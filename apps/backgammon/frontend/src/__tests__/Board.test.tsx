/**
 * Tests for the Board component — focused on the cosmetics / theme wiring.
 *
 * Full interactive board behaviour (clicks, drags, animations) is covered by
 * the higher-level Game + integration tests. Here we verify that the theme
 * and checker-style props land on the rendered DOM as data-attributes so the
 * scoped CSS variables in Board.css pick them up.
 */

import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Board from "../components/Board";
import type { GameState } from "../types/game";

function makeGameState(): GameState {
  return {
    points: Array(26).fill(0),
    bar_white: 0,
    bar_black: 0,
    off_white: 0,
    off_black: 0,
    current_turn: "white",
    dice: null,
    remaining_dice: [],
    status: "waiting",
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
}

function renderBoard(boardTheme?: string, checkerStyle?: string) {
  const noop = () => {};
  return render(
    <Board
      gameState={makeGameState()}
      myColor="white"
      selectedPoint={null}
      validMoves={[]}
      onPointClick={noop}
      onBarClick={noop}
      onBearOffClick={noop}
      cubeValue={1}
      cubeOwner={null}
      boardTheme={boardTheme}
      checkerStyle={checkerStyle}
    />,
  );
}

describe("Board – theme wiring", () => {
  it("defaults to the classic theme when no props are given", () => {
    const { container } = renderBoard();
    const board = container.querySelector(".board-container");
    expect(board).not.toBeNull();
    expect(board!.getAttribute("data-theme")).toBe("classic");
    expect(board!.getAttribute("data-checker")).toBe("classic");
  });

  it("applies the requested board theme and checker style", () => {
    const { container } = renderBoard("dark-marble", "marble");
    const board = container.querySelector(".board-container");
    expect(board!.getAttribute("data-theme")).toBe("dark-marble");
    expect(board!.getAttribute("data-checker")).toBe("marble");
  });

  it("falls back to classic for an unknown theme ID", () => {
    const { container } = renderBoard("does-not-exist", "also-fake");
    const board = container.querySelector(".board-container");
    expect(board!.getAttribute("data-theme")).toBe("classic");
    expect(board!.getAttribute("data-checker")).toBe("classic");
  });

  it("changes the data-attribute when the prop changes", () => {
    const { container, rerender } = renderBoard("classic", "classic");
    let board = container.querySelector(".board-container")!;
    expect(board.getAttribute("data-theme")).toBe("classic");

    rerender(
      <Board
        gameState={makeGameState()}
        myColor="white"
        selectedPoint={null}
        validMoves={[]}
        onPointClick={() => {}}
        onBarClick={() => {}}
        onBearOffClick={() => {}}
        cubeValue={1}
        cubeOwner={null}
        boardTheme="green-felt"
        checkerStyle="metal"
      />,
    );

    board = container.querySelector(".board-container")!;
    expect(board.getAttribute("data-theme")).toBe("green-felt");
    expect(board.getAttribute("data-checker")).toBe("metal");
  });
});
