import type { Game } from "../models/types.js";

/**
 * In-memory game state storage.
 *
 * Uses two Maps for O(1) lookup by either ID or code.
 * Both maps reference the same Game objects, so updates are visible through both.
 *
 * This is behind a clean interface so a Redis-backed implementation
 * can be swapped in later without touching game logic.
 */
export class GameStore {
  private byId: Map<string, Game> = new Map();
  private byCode: Map<string, Game> = new Map();

  create(game: Game): void {
    this.byId.set(game.id, game);
    this.byCode.set(game.code, game);
  }

  getById(id: string): Game | undefined {
    return this.byId.get(id);
  }

  getByCode(code: string): Game | undefined {
    return this.byCode.get(code.toUpperCase());
  }

  update(_game: Game): void {
    // In-memory: the game is a reference type, so mutations are already visible.
    // This method exists to satisfy the interface for a future Redis implementation
    // where you'd serialize and write back.
  }

  delete(id: string): void {
    const game = this.byId.get(id);
    if (game) {
      this.byCode.delete(game.code);
      this.byId.delete(id);
    }
  }

  isCodeInUse(code: string): boolean {
    return this.byCode.has(code.toUpperCase());
  }

  getAll(): Game[] {
    return Array.from(this.byId.values());
  }

  /**
   * Total number of active games. Used for health check.
   */
  size(): number {
    return this.byId.size;
  }

  /**
   * Total number of connected players across all games. Used for health check.
   */
  totalConnectedPlayers(): number {
    let count = 0;
    for (const game of this.byId.values()) {
      count += game.players.filter(p => p.isConnected).length;
    }
    return count;
  }
}
