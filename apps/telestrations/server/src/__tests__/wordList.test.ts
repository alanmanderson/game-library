import { describe, it, expect } from "vitest";
import { getRandomWord } from "../game/WordList.js";

describe("getRandomWord", () => {
  it("returns a string", () => {
    const word = getRandomWord();
    expect(typeof word).toBe("string");
  });

  it("returns a non-empty string", () => {
    for (let i = 0; i < 50; i++) {
      const word = getRandomWord();
      expect(word.length).toBeGreaterThan(0);
    }
  });

  it("returns different words over many calls (not deterministic)", () => {
    const words = new Set<string>();
    for (let i = 0; i < 100; i++) {
      words.add(getRandomWord());
    }
    // Should have gotten at least a few different words
    expect(words.size).toBeGreaterThan(1);
  });
});
