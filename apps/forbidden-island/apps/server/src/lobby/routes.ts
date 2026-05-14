import type { FastifyInstance } from 'fastify';
import type { RoomManager } from '../ws/rooms.js';

export function registerLobbyRoutes(app: FastifyInstance, roomManager: RoomManager): void {
  /** List open games */
  app.get('/api/games', async () => {
    return roomManager.getOpenGames();
  });

  /** Create a game (alternative to WS lobby:create, but WS is preferred) */
  app.post('/api/games', async (request, reply) => {
    // For the MVP, game creation is handled via WebSocket.
    // This endpoint exists as a convenience for checking the API.
    reply.status(501).send({ error: 'Use WebSocket lobby:create to create games.' });
  });

  /** Get lobby state for a game */
  app.get<{ Params: { id: string } }>('/api/games/:id', async (request, reply) => {
    const { id } = request.params;
    const lobby = roomManager.getGameLobby(id);

    if (!lobby) {
      reply.status(404).send({ error: 'Game not found.' });
      return;
    }

    return lobby;
  });

  /** Health check */
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });
}
