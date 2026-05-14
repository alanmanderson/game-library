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

  // CORS -- allow the Vite dev server
  await app.register(fastifyCors, {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
    ],
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
