import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PuzzleRenderer from "../components/PuzzleRenderer";
import type { Puzzle } from "../types/game";

function makePuzzle(overrides: Partial<Puzzle>): Puzzle {
  return {
    id: "p1",
    type: "caesar_cipher",
    title: "Test Puzzle",
    instructions: "Solve it",
    content: { text: "ABC", shift: 3 },
    difficulty: "easy",
    ...overrides,
  };
}

describe("PuzzleRenderer", () => {
  it("renders caesar cipher with text and shift", () => {
    render(
      <PuzzleRenderer
        puzzle={makePuzzle({
          type: "caesar_cipher",
          content: { text: "KHOOR", shift: 3 },
        })}
      />,
    );
    expect(screen.getByText("KHOOR")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders anagram with letter tiles", () => {
    render(
      <PuzzleRenderer
        puzzle={makePuzzle({
          type: "anagram",
          content: { letters: "ELPPA" },
        })}
      />,
    );
    // Each letter should be a tile
    expect(screen.getByText("E")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders number code with tiles", () => {
    render(
      <PuzzleRenderer
        puzzle={makePuzzle({
          type: "number_code",
          content: { numbers: [1, 2, 3] },
        })}
      />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders reverse message", () => {
    render(
      <PuzzleRenderer
        puzzle={makePuzzle({
          type: "reverse_message",
          content: { text: "OLLEH" },
        })}
      />,
    );
    expect(screen.getByText("OLLEH")).toBeInTheDocument();
  });

  it("renders first letters with highlighted first chars", () => {
    render(
      <PuzzleRenderer
        puzzle={makePuzzle({
          type: "first_letters",
          content: { sentences: ["Hello world", "Amazing day"] },
        })}
      />,
    );
    // The sentences should be visible
    expect(screen.getByText(/ello world/)).toBeInTheDocument();
    expect(screen.getByText(/mazing day/)).toBeInTheDocument();
  });

  it("renders morse code", () => {
    render(
      <PuzzleRenderer
        puzzle={makePuzzle({
          type: "morse_code",
          content: { code: "....  .  .-..  .-..  ---" },
        })}
      />,
    );
    // Morse letters are split by 2+ spaces and rendered individually
    expect(screen.getByText("....")).toBeInTheDocument();
    expect(screen.getByText("---")).toBeInTheDocument();
  });

  it("renders word chain clues", () => {
    render(
      <PuzzleRenderer
        puzzle={makePuzzle({
          type: "word_chain",
          content: { clues: ["First clue", "Second clue"] },
        })}
      />,
    );
    expect(screen.getByText("First clue")).toBeInTheDocument();
    expect(screen.getByText("Second clue")).toBeInTheDocument();
  });

  it("renders missing vowels", () => {
    render(
      <PuzzleRenderer
        puzzle={makePuzzle({
          type: "missing_vowels",
          content: { text: "PRGRMMNG" },
        })}
      />,
    );
    expect(screen.getByText("PRGRMMNG")).toBeInTheDocument();
  });

  it("renders letter math equations", () => {
    render(
      <PuzzleRenderer
        puzzle={makePuzzle({
          type: "letter_math",
          content: { equations: ["A + B = 5", "C - A = 2"] },
        })}
      />,
    );
    expect(screen.getByText("A + B = 5")).toBeInTheDocument();
    expect(screen.getByText("C - A = 2")).toBeInTheDocument();
  });

  it("renders keyboard shift", () => {
    render(
      <PuzzleRenderer
        puzzle={makePuzzle({
          type: "keyboard_shift",
          content: { text: "JGNNQ", direction: "right", positions: 1 },
        })}
      />,
    );
    expect(screen.getByText("JGNNQ")).toBeInTheDocument();
    expect(screen.getByText("right")).toBeInTheDocument();
  });
});
