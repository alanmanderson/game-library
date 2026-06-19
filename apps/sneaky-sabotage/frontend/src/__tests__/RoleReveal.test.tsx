import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RoleReveal from "../components/RoleReveal";

describe("RoleReveal", () => {
  const defaultProps = {
    role: "agent" as const,
    hint: null,
    roundNumber: 1,
    readyCount: 0,
    readyTotal: 5,
    sendMessage: vi.fn(),
  };

  it("shows the Agent role card", () => {
    render(<RoleReveal {...defaultProps} />);
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText(/you are an agent/i)).toBeInTheDocument();
  });

  it("shows the Saboteur role with hint", () => {
    render(
      <RoleReveal
        {...defaultProps}
        role="saboteur"
        hint="The answer is PYTHON"
      />,
    );
    expect(screen.getByText("Saboteur")).toBeInTheDocument();
    expect(screen.getByText("The answer is PYTHON")).toBeInTheDocument();
    expect(screen.getByText("Secret Hint")).toBeInTheDocument();
  });

  it("shows the Insider role", () => {
    render(<RoleReveal {...defaultProps} role="insider" hint="RUBY" />);
    expect(screen.getByText("Insider")).toBeInTheDocument();
    expect(screen.getByText("RUBY")).toBeInTheDocument();
  });

  it("sends ready message when button is clicked", () => {
    const sendMessage = vi.fn();
    render(<RoleReveal {...defaultProps} sendMessage={sendMessage} />);

    fireEvent.click(screen.getByRole("button", { name: /i'm ready/i }));
    expect(sendMessage).toHaveBeenCalledWith({ type: "ready" });
  });

  it("disables the ready button after clicking", () => {
    render(<RoleReveal {...defaultProps} />);
    const btn = screen.getByRole("button", { name: /i'm ready/i });
    fireEvent.click(btn);
    expect(
      screen.getByRole("button", { name: /waiting for others/i }),
    ).toBeDisabled();
  });

  it("shows ready count", () => {
    render(<RoleReveal {...defaultProps} readyCount={3} readyTotal={5} />);
    expect(screen.getByText("3 / 5 players ready")).toBeInTheDocument();
  });

  it("shows the round number", () => {
    render(<RoleReveal {...defaultProps} roundNumber={3} />);
    expect(screen.getByText("Round 3")).toBeInTheDocument();
  });
});
