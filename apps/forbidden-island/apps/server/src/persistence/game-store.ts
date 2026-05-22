import pg from 'pg';
import type { GameState, LobbyState } from '@forbidden-island/shared';

const { Pool } = pg;

/** Row shape stored in the games table. */
export interface GameRow {
  gameId: string;
  lobby: LobbyState;
  state: GameState | null;
  playerSecrets: Record<string, string>;
  createdAt: number;
}

/**
 * Persists game rooms to PostgreSQL so games survive server restarts.
 * Uses a single `games` JSONB table — no migrations needed.
 */
export class GameStore {
  private pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  /** Create the games table if it doesn't exist. */
  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS games (
        game_id   TEXT PRIMARY KEY,
        lobby     JSONB NOT NULL,
        state     JSONB,
        player_secrets JSONB NOT NULL DEFAULT '{}',
        created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  /** Load all games that haven't been garbage-collected. */
  async loadAll(): Promise<GameRow[]> {
    const { rows } = await this.pool.query<{
      game_id: string;
      lobby: LobbyState;
      state: GameState | null;
      player_secrets: Record<string, string>;
      created_at: string;
    }>('SELECT game_id, lobby, state, player_secrets, created_at FROM games');

    return rows.map((r) => ({
      gameId: r.game_id,
      lobby: r.lobby,
      state: r.state,
      playerSecrets: r.player_secrets,
      createdAt: Number(r.created_at),
    }));
  }

  /** Insert a new game. */
  async save(row: GameRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO games (game_id, lobby, state, player_secrets, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (game_id) DO UPDATE SET
         lobby = EXCLUDED.lobby,
         state = EXCLUDED.state,
         player_secrets = EXCLUDED.player_secrets,
         updated_at = NOW()`,
      [
        row.gameId,
        JSON.stringify(row.lobby),
        row.state ? JSON.stringify(row.state) : null,
        JSON.stringify(row.playerSecrets),
        row.createdAt,
      ],
    );
  }

  /** Update just the game state (hot path — called after every action). */
  async updateState(gameId: string, state: GameState | null): Promise<void> {
    await this.pool.query(
      'UPDATE games SET state = $1, updated_at = NOW() WHERE game_id = $2',
      [state ? JSON.stringify(state) : null, gameId],
    );
  }

  /** Update lobby state (role changes, player joins/leaves). */
  async updateLobby(gameId: string, lobby: LobbyState): Promise<void> {
    await this.pool.query(
      'UPDATE games SET lobby = $1, updated_at = NOW() WHERE game_id = $2',
      [JSON.stringify(lobby), gameId],
    );
  }

  /** Delete a game (garbage collection). */
  async delete(gameId: string): Promise<void> {
    await this.pool.query('DELETE FROM games WHERE game_id = $1', [gameId]);
  }

  /** Clean up stale games older than the given age in ms. */
  async deleteOlderThan(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    const result = await this.pool.query(
      'DELETE FROM games WHERE created_at < $1',
      [cutoff],
    );
    return result.rowCount ?? 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
