import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { RoomManager } from './ws/rooms.js';
import { createWebSocketHandler } from './ws/handler.js';
import { registerLobbyRoutes } from './lobby/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  // Also listen on /game-ws (production path used by the client)
  app.get('/game-ws', { websocket: true }, (socket) => {
    wsHandler(socket);
  });

  // REST routes
  registerLobbyRoutes(app, roomManager);

  // Serve static client build in production
  const clientDistPath = process.env.CLIENT_DIST_PATH
    ?? path.resolve(__dirname, '../../client/dist');

  if (fs.existsSync(clientDistPath)) {
    await app.register(fastifyStatic, {
      root: clientDistPath,
      wildcard: false,
    });

    // SPA fallback: serve index.html for non-API, non-WS GET requests
    app.setNotFoundHandler(async (_request, reply) => {
      return reply.sendFile('index.html');
    });
  }

  return app;
}
