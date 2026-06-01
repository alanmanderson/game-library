import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HomeScreen from "../components/HomeScreen";
import * as api from "../services/api";

vi.mock("../services/api", () => ({
  createGame: vi.fn(),
  joinGame: vi.fn(),
  getGame: vi.fn(),
}));

describe("HomeScreen", () => {
  const onSessionCreated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the title and action buttons", () => {
    render(<HomeScreen onSessionCreated={onSessionCreated} />);
    expect(screen.getByText("Sneaky Sabotage")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create game/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /join game/i }),
    ).toBeInTheDocument();
  });

  it("shows create form when Create Game is clicked", () => {
    render(<HomeScreen onSessionCreated={onSessionCreated} />);
    fireEvent.click(screen.getByRole("button", { name: /create game/i }));
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
  });

  it("shows join form when Join Game is clicked", () => {
    render(<HomeScreen onSessionCreated={onSessionCreated} />);
    fireEvent.click(screen.getByRole("button", { name: /join game/i }));
    expect(screen.getByLabelText(/game code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
  });

  it("validates name is required for create", async () => {
    render(<HomeScreen onSessionCreated={onSessionCreated} />);
    fireEvent.click(screen.getByRole("button", { name: /create game/i }));
    // Click create without entering name
    fireEvent.click(screen.getByRole("button", { name: /create game/i }));
    expect(screen.getByText(/please enter your name/i)).toBeInTheDocument();
  });

  it("calls createGame and triggers onSessionCreated", async () => {
    vi.mocked(api.createGame).mockResolvedValue({
      game_id: "ABCD",
      player_id: "p1",
      session_token: "tok",
    });

    render(<HomeScreen onSessionCreated={onSessionCreated} />);
    fireEvent.click(screen.getByRole("button", { name: /create game/i }));

    const input = screen.getByLabelText(/your name/i);
    fireEvent.change(input, { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: /create game/i }));

    await waitFor(() => {
      expect(api.createGame).toHaveBeenCalledWith("Alice");
    });

    await waitFor(() => {
      expect(onSessionCreated).toHaveBeenCalledWith({
        game_id: "ABCD",
        player_id: "p1",
        session_token: "tok",
      });
    });
  });

  it("calls joinGame and triggers onSessionCreated", async () => {
    vi.mocked(api.joinGame).mockResolvedValue({
      game_id: "WXYZ",
      player_id: "p2",
      session_token: "tok2",
    });

    render(<HomeScreen onSessionCreated={onSessionCreated} />);
    fireEvent.click(screen.getByRole("button", { name: /join game/i }));

    const codeInput = screen.getByLabelText(/game code/i);
    const nameInput = screen.getByLabelText(/your name/i);

    fireEvent.change(codeInput, { target: { value: "wxyz" } });
    fireEvent.change(nameInput, { target: { value: "Bob" } });
    fireEvent.click(screen.getByRole("button", { name: /join game/i }));

    await waitFor(() => {
      expect(api.joinGame).toHaveBeenCalledWith("WXYZ", "Bob");
    });

    await waitFor(() => {
      expect(onSessionCreated).toHaveBeenCalledWith({
        game_id: "WXYZ",
        player_id: "p2",
        session_token: "tok2",
      });
    });
  });

  it("displays error when createGame fails", async () => {
    vi.mocked(api.createGame).mockRejectedValue(new Error("Server error"));

    render(<HomeScreen onSessionCreated={onSessionCreated} />);
    fireEvent.click(screen.getByRole("button", { name: /create game/i }));

    const input = screen.getByLabelText(/your name/i);
    fireEvent.change(input, { target: { value: "Charlie" } });
    fireEvent.click(screen.getByRole("button", { name: /create game/i }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("goes back to idle mode when Back is clicked", () => {
    render(<HomeScreen onSessionCreated={onSessionCreated} />);
    fireEvent.click(screen.getByRole("button", { name: /create game/i }));
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(
      screen.getByRole("button", { name: /create game/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /join game/i }),
    ).toBeInTheDocument();
  });
});
