import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { ClientMessage } from '@forbidden-island/shared';
import type { RoomManager } from './rooms.js';

// ─── Zod schemas for message validation ─────────────────────────────────

const GridPositionSchema = z.object({
  row: z.number().int().min(0).max(5),
  col: z.number().int().min(0).max(5),
});

const DifficultySchema = z.enum(['novice', 'normal', 'elite', 'legendary']);

const RoleNameSchema = z.enum([
  'explorer', 'diver', 'engineer', 'pilot', 'messenger', 'navigator',
]);

const TreasureTypeSchema = z.enum([
  'earth_stone', 'statue_of_wind', 'crystal_of_fire', 'oceans_chalice',
]);

const GameActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), targetPosition: GridPositionSchema }),
  z.object({ type: z.literal('shore_up'), targetPosition: GridPositionSchema }),
  z.object({
    type: z.literal('give_card'),
    cardId: z.string(),
    targetPlayerId: z.string(),
  }),
  z.object({
    type: z.literal('capture_treasure'),
    treasureType: TreasureTypeSchema,
  }),
  z.object({
    type: z.literal('play_helicopter_lift'),
    cardId: z.string(),
    playerIds: z.array(z.string()).min(1),
    targetPosition: GridPositionSchema,
  }),
  z.object({
    type: z.literal('play_sandbags'),
    cardId: z.string(),
    targetPosition: GridPositionSchema,
  }),
  z.object({ type: z.literal('discard'), cardId: z.string() }),
  z.object({ type: z.literal('swim'), targetPosition: GridPositionSchema }),
  z.object({ type: z.literal('end_actions') }),
  z.object({
    type: z.literal('navigator_move'),
    targetPlayerId: z.string(),
    targetPosition: GridPositionSchema,
  }),
]);

const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('lobby:create'),
    playerName: z.string().min(1).max(20),
    difficulty: DifficultySchema,
  }),
  z.object({
    type: z.literal('lobby:join'),
    gameId: z.string(),
    playerName: z.string().min(1).max(20),
  }),
  z.object({ type: z.literal('lobby:leave') }),
  z.object({ type: z.literal('lobby:start') }),
  z.object({
    type: z.literal('lobby:set_difficulty'),
    difficulty: DifficultySchema,
  }),
  z.object({
    type: z.literal('lobby:select_role'),
    role: RoleNameSchema,
  }),
  z.object({
    type: z.literal('game:action'),
    action: GameActionSchema,
  }),
  z.object({
    type: z.literal('game:reconnect'),
    gameId: z.string(),
    playerId: z.string(),
    secret: z.string(),
  }),
]);

// ─── Handler ────────────────────────────────────────────────────────────

export function createWebSocketHandler(roomManager: RoomManager) {
  return function handleConnection(ws: WebSocket): void {
    roomManager.handleConnect(ws);

    ws.on('message', (data: Buffer | string) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString();
        const parsed = JSON.parse(raw);
        const result = ClientMessageSchema.safeParse(parsed);

        if (!result.success) {
          ws.send(JSON.stringify({
            type: 'lobby:error',
            message: `Invalid message: ${result.error.issues[0]?.message ?? 'unknown error'}`,
          }));
          return;
        }

        roomManager.handleMessage(ws, result.data as ClientMessage);
      } catch {
        ws.send(JSON.stringify({
          type: 'lobby:error',
          message: 'Invalid JSON.',
        }));
      }
    });

    ws.on('close', () => {
      roomManager.handleDisconnect(ws);
    });

    ws.on('error', () => {
      roomManager.handleDisconnect(ws);
    });
  };
}
