import { describe, expect, it, vi, afterEach } from "vitest";
import { withJitter } from "./jitter";

describe("withJitter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a value in [base/2, base] for a typical base", () => {
    const base = 4000;
    for (let i = 0; i < 200; i++) {
      const v = withJitter(base);
      expect(v).toBeGreaterThanOrEqual(base / 2);
      expect(v).toBeLessThanOrEqual(base);
    }
  });

  it("returns the lower bound (base/2) when Math.random is 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(withJitter(8000)).toBe(4000);
  });

  it("approaches the upper bound as Math.random approaches 1", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9999);
    const v = withJitter(8000);
    expect(v).toBeGreaterThan(7999);
    expect(v).toBeLessThanOrEqual(8000);
  });

  it("varies across calls (no stampede)", () => {
    const samples = new Set<number>();
    for (let i = 0; i < 50; i++) {
      samples.add(withJitter(2000));
    }
    // Vanishingly unlikely to collide 50 times across a 1000ms continuous range.
    expect(samples.size).toBeGreaterThan(40);
  });

  it("handles a zero base (degenerate)", () => {
    expect(withJitter(0)).toBe(0);
  });
});
