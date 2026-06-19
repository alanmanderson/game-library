import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FinalScores from "../components/FinalScores";
import type { Standing } from "../types/game";

describe("FinalScores", () => {
  const standings: Standing[] = [
    { id: "p1", name: "Alice", score: 30 },
    { id: "p2", name: "Bob", score: 20 },
    { id: "p3", name: "Charlie", score: 10 },
  ];

  it("shows the winner name and score", () => {
    render(<FinalScores standings={standings} onLeave={vi.fn()} />);
    // Alice appears in both the winner section and the leaderboard
    expect(screen.getAllByText("Alice")).toHaveLength(2);
    expect(screen.getByText("30 points")).toBeInTheDocument();
    expect(screen.getByText("Winner")).toBeInTheDocument();
  });

  it("shows all standings with rankings", () => {
    render(<FinalScores standings={standings} onLeave={vi.fn()} />);
    expect(screen.getByText("1st")).toBeInTheDocument();
    expect(screen.getByText("2nd")).toBeInTheDocument();
    expect(screen.getByText("3rd")).toBeInTheDocument();
  });

  it("calls onLeave when Play Again is clicked", () => {
    const onLeave = vi.fn();
    render(<FinalScores standings={standings} onLeave={onLeave} />);
    fireEvent.click(screen.getByRole("button", { name: /play again/i }));
    expect(onLeave).toHaveBeenCalled();
  });
});
