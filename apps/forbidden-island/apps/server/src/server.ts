import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { RoomManager } from './ws/rooms.js';
import { createWebSocketHandler } from './ws/handler.js';
import { registerLobbyRoutes } from './lobby/routes.js';

export async function createServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  // CORS -- allow the Vite dev server on any port
  await app.register(fastifyCors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // WebSocket plugin
  await app.register(fastifyWebsocket);

  // Room manager -- single instance, holds all game state in memory
  const roomManager = new RoomManager();

  // WebSocket route
  const wsHandler = createWebSocketHandler(roomManager);
  app.get('/ws', { websocket: true }, (socket) => {
    wsHandler(socket);
  });

  // REST routes
  registerLobbyRoutes(app, roomManager);

  return app;
}
