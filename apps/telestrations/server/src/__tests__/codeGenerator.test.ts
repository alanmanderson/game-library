import { describe, it, expect } from "vitest";
import { generateGameCode, generateUniqueGameCode } from "../utils/codeGenerator.js";

const ALLOWED = "ABCDEFGHJKMNPQRSTUVWXYZ";
const FORBIDDEN = ["I", "O", "L"];

describe("generateGameCode", () => {
  it("returns a 4-character string", () => {
    const code = generateGameCode();
    expect(code).toHaveLength(4);
  });

  it("only uses allowed characters (no I, O, L)", () => {
    // Generate many codes to reduce flakiness
    for (let i = 0; i < 200; i++) {
      const code = generateGameCode();
      for (const ch of code) {
        expect(ALLOWED).toContain(ch);
        expect(FORBIDDEN).not.toContain(ch);
      }
    }
  });

  it("returns uppercase letters", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateGameCode();
      expect(code).toMatch(/^[A-Z]+$/);
    }
  });

  it("generates codes that vary (not all the same)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateGameCode());
    }
    // Statistically impossible to get fewer than 2 unique out of 50
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("generateUniqueGameCode", () => {
  it("returns a code not in the existing set", () => {
    const existing = new Set(["ABCD", "EFGH"]);
    const code = generateUniqueGameCode((c) => existing.has(c));
    expect(existing.has(code)).toBe(false);
    expect(code).toHaveLength(4);
  });

  it("works when no codes are in use", () => {
    const code = generateUniqueGameCode(() => false);
    expect(code).toHaveLength(4);
  });

  it("throws after 100 failed attempts", () => {
    // Every code is "in use"
    expect(() => generateUniqueGameCode(() => true)).toThrow(
      "Failed to generate a unique game code after 100 attempts"
    );
  });
});
