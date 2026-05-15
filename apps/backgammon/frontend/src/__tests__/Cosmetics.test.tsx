/**
 * Tests for the Cosmetics settings panel.
 *
 * Verifies the theme grid renders, selection updates the UI, and the
 * preferences API is called with the picked values. API calls are mocked.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Cosmetics from "../components/Cosmetics";
import type { Player } from "../types/game";

vi.mock("../services/api", () => ({
  updateMyPreferences: vi.fn(),
}));

import * as api from "../services/api";

const registeredPlayer: Player = {
  id: "player-1",
  nickname: "Tester",
  created_at: "2025-01-01T00:00:00",
  is_guest: false,
  board_theme: "classic",
  checker_style: "classic",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.updateMyPreferences).mockResolvedValue({
    ...registeredPlayer,
    board_theme: "dark-marble",
    checker_style: "marble",
  });
});

describe("Cosmetics", () => {
  it("renders three board themes and three checker styles", () => {
    render(<Cosmetics player={registeredPlayer} />);
    expect(screen.getByTestId("theme-option-classic")).toBeInTheDocument();
    expect(screen.getByTestId("theme-option-dark-marble")).toBeInTheDocument();
    expect(screen.getByTestId("theme-option-green-felt")).toBeInTheDocument();
    expect(screen.getByTestId("checker-option-classic")).toBeInTheDocument();
    expect(screen.getByTestId("checker-option-marble")).toBeInTheDocument();
    expect(screen.getByTestId("checker-option-metal")).toBeInTheDocument();
  });

  it("marks the player's current theme as selected", () => {
    render(<Cosmetics player={registeredPlayer} />);
    expect(
      screen.getByTestId("theme-option-classic").getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByTestId("theme-option-dark-marble")
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("calls the preferences API when a new theme is picked", async () => {
    render(<Cosmetics player={registeredPlayer} />);
    fireEvent.click(screen.getByTestId("theme-option-dark-marble"));

    await waitFor(() => {
      expect(api.updateMyPreferences).toHaveBeenCalledWith({
        board_theme: "dark-marble",
      });
    });
    // Local state updates immediately — selection reflects new theme.
    expect(
      screen
        .getByTestId("theme-option-dark-marble")
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("calls the preferences API when a new checker style is picked", async () => {
    render(<Cosmetics player={registeredPlayer} />);
    fireEvent.click(screen.getByTestId("checker-option-marble"));

    await waitFor(() => {
      expect(api.updateMyPreferences).toHaveBeenCalledWith({
        checker_style: "marble",
      });
    });
  });

  it("shows an error if the API rejects", async () => {
    vi.mocked(api.updateMyPreferences).mockRejectedValue(
      new Error("Server error"),
    );
    render(<Cosmetics player={registeredPlayer} />);
    fireEvent.click(screen.getByTestId("theme-option-green-felt"));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("shows a guest notice for guest players", () => {
    const guest: Player = {
      ...registeredPlayer,
      id: "guest-1",
      is_guest: true,
    };
    render(<Cosmetics player={guest} />);
    expect(
      screen.getByText(/Guest preferences aren't saved/i),
    ).toBeInTheDocument();
  });
});
