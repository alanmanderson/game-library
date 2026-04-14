/**
 * Tests for WaitingState — the in-game waiting screen shown while the opponent
 * has not yet joined. Covers the connecting/waiting branches, clipboard copy,
 * bot invite success, and bot invite failure surfacing via an error banner.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import WaitingState from "../components/WaitingState";

vi.mock("../services/api", () => ({
  inviteBot: vi.fn(),
}));

import * as api from "../services/api";

beforeEach(() => {
  vi.clearAllMocks();
});

function renderWaiting(props: Partial<React.ComponentProps<typeof WaitingState>> = {}) {
  const full = {
    tableId: "TBL123",
    isConnected: true,
    waitingForOpponent: true,
    ...props,
  };
  return render(
    <MemoryRouter>
      <WaitingState {...full} />
    </MemoryRouter>,
  );
}

describe("WaitingState — connecting branch", () => {
  it("shows 'Connecting...' while not waiting and not connected", () => {
    renderWaiting({ waitingForOpponent: false, isConnected: false });
    expect(screen.getByText(/connecting/i)).toBeTruthy();
    expect(screen.queryByText(/share this table id/i)).toBeNull();
  });

  it("shows 'Loading game...' while not waiting but connected", () => {
    renderWaiting({ waitingForOpponent: false, isConnected: true });
    expect(screen.getByText(/loading game/i)).toBeTruthy();
  });
});

describe("WaitingState — waiting branch", () => {
  it("shows the share-ID block and Play vs Bot button", () => {
    renderWaiting();
    expect(screen.getByText(/waiting for opponent to join/i)).toBeTruthy();
    expect(screen.getByText("TBL123")).toBeTruthy();
    expect(screen.getByRole("button", { name: /play vs bot/i })).toBeTruthy();
  });

  it("copies the table ID to clipboard and flips the button label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderWaiting();
    fireEvent.click(screen.getByRole("button", { name: /^copy$/i }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("TBL123");
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /copied/i })).toBeTruthy();
    });
  });

  it("invokes inviteBot when Play vs Bot is clicked", async () => {
    vi.mocked(api.inviteBot).mockResolvedValue(undefined as never);
    renderWaiting();
    fireEvent.click(screen.getByRole("button", { name: /play vs bot/i }));
    await waitFor(() => {
      expect(api.inviteBot).toHaveBeenCalledWith("TBL123");
    });
  });

  it("surfaces an error banner when inviteBot fails and re-enables the button", async () => {
    vi.mocked(api.inviteBot).mockRejectedValue(new Error("Bot unavailable"));
    renderWaiting();
    const btn = screen.getByRole("button", { name: /play vs bot/i });
    fireEvent.click(btn);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Bot unavailable");
    // Button re-enabled after failure
    expect(screen.getByRole("button", { name: /play vs bot/i }).hasAttribute("disabled")).toBe(false);
  });
});
