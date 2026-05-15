/**
 * Tests for the Spectator component.
 *
 * Verifies that the WebSocket URL is constructed correctly (single token,
 * appended by useWebSocket, not by Spectator itself). This is the regression
 * test for issue #167 — double-appended auth token breaking spectator mode.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Capture the URL that Spectator passes to useWebSocket.
const mockUseWebSocket = vi.fn().mockReturnValue({
  sendMessage: vi.fn(),
  isConnected: false,
  lastMessage: null,
  reconnectAttempts: 0,
});

vi.mock("../hooks/useWebSocket", () => ({
  useWebSocket: (...args: unknown[]) => mockUseWebSocket(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSpectator(tableId: string) {
  return render(
    <MemoryRouter initialEntries={[`/spectate/${tableId}`]}>
      <Routes>
        <Route path="/spectate/:tableId" element={<SpectatorLazy />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Lazy-import Spectator AFTER mocks are set up.
let SpectatorLazy: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset modules so fresh mocks take effect.
  const mod = await import("../components/Spectator");
  SpectatorLazy = mod.default;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Spectator WebSocket URL construction", () => {
  it("does not include a token query parameter in the URL passed to useWebSocket", () => {
    renderSpectator("ABC12345");

    expect(mockUseWebSocket).toHaveBeenCalled();
    const options = mockUseWebSocket.mock.calls[0][0];
    const url: string = options.url;

    // The URL should end with /spectate and contain NO query params at all —
    // useWebSocket is responsible for appending ?token=...
    expect(url).toContain("/ws/ABC12345/spectate");
    expect(url).not.toContain("token=");
    expect(url).not.toContain("?");
  });

  it("constructs a ws: URL when the page is served over http:", () => {
    renderSpectator("GAME0001");

    const options = mockUseWebSocket.mock.calls[0][0];
    const url: string = options.url;

    expect(url).toMatch(/^ws:\/\//);
    expect(url).toContain("/ws/GAME0001/spectate");
  });

  it("passes an empty string URL when tableId is missing", () => {
    // Render at a route where :tableId is absent.
    render(
      <MemoryRouter initialEntries={["/spectate/"]}>
        <Routes>
          <Route path="/spectate/" element={<SpectatorLazy />} />
        </Routes>
      </MemoryRouter>,
    );

    // With no tableId, Spectator should pass "" so useWebSocket won't connect.
    // It may also render the "Invalid game URL" fallback, which is fine.
    // If useWebSocket was called, the url should be empty.
    if (mockUseWebSocket.mock.calls.length > 0) {
      const options = mockUseWebSocket.mock.calls[0][0];
      expect(options.url).toBe("");
    } else {
      // Component bailed out before calling useWebSocket — also acceptable.
      expect(screen.getByText(/invalid game url/i)).toBeTruthy();
    }
  });
});

describe("Spectator rendering states", () => {
  it("shows 'Connecting...' when not yet connected and no game state", () => {
    mockUseWebSocket.mockReturnValue({
      sendMessage: vi.fn(),
      isConnected: false,
      lastMessage: null,
      reconnectAttempts: 0,
    });

    renderSpectator("TBL99999");

    expect(screen.getByText(/connecting/i)).toBeTruthy();
  });

  it("shows 'Loading game...' when connected but no game state yet", () => {
    mockUseWebSocket.mockReturnValue({
      sendMessage: vi.fn(),
      isConnected: true,
      lastMessage: null,
      reconnectAttempts: 0,
    });

    renderSpectator("TBL99999");

    expect(screen.getByText(/loading game/i)).toBeTruthy();
  });
});
