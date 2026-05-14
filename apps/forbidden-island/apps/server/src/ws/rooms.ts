import type { WebSocket } from 'ws';
import type {
  GameState, ServerMessage, ClientMessage, LobbyState, LobbyPlayer,
  GameListEntry, Difficulty, RoleName, GameAction,
} from '@forbidden-island/shared';
import {
  MAX_PLAYERS, MIN_PLAYERS, DISCONNECT_TIMEOUT_MS, GAME_GC_TIMEOUT_MS,
} from '@forbidden-island/shared';
import { generateGameId, generatePlayerId, generateSecret } from '../utils/id.js';
import { setupGame } from '../engine/board-setup.js';
import { processAction, toClientState, skipDisconnectedTurn } from '../engine/game-engine.js';

// ─── Types ──────────────────────────────────────────────────────────────

interface ClientInfo {
  ws: WebSocket;
  playerId: string;
  secret: string;
  gameId: string | null;
  playerName: string;
}

interface GameRoom {
  gameId: string;
  lobby: LobbyState;
  state: GameState | null;
  playerSecrets: Map<string, string>;
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
  gcTimer: ReturnType<typeof setTimeout> | null;
  createdAt: number;
}

// ─── Room Manager ───────────────────────────────────────────────────────

export class RoomManager {
  private clients = new Map<WebSocket, ClientInfo>();
  private games = new Map<string, GameRoom>();
  private playerToWs = new Map<string, WebSocket>();

  // ─── Connection lifecycle ─────────────────────────────────────────

  handleConnect(ws: WebSocket): void {
    const playerId = generatePlayerId();
    const secret = generateSecret();

    const clientInfo: ClientInfo = {
      ws,
      playerId,
      secret,
      gameId: null,
      playerName: '',
    };

    this.clients.set(ws, clientInfo);
    this.playerToWs.set(playerId, ws);

    this.send(ws, {
      type: 'lobby:identity',
      playerId,
      secret,
    });
  }

  handleDisconnect(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (!client) return;

    const { playerId, gameId } = client;

    this.clients.delete(ws);
    this.playerToWs.delete(playerId);

    if (gameId) {
      const room = this.games.get(gameId);
      if (room) {
        if (room.state) {
          // In-game disconnect
          room.state = {
            ...room.state,
            players: room.state.players.map((p) =>
              p.id === playerId ? { ...p, isConnected: false } : p,
            ),
          };

          this.broadcastToGame(gameId, {
            type: 'game:player_disconnected',
            playerId,
          });

          // Start disconnect timeout
          const timer = setTimeout(() => {
            this.handleDisconnectTimeout(gameId, playerId);
          }, DISCONNECT_TIMEOUT_MS);
          room.disconnectTimers.set(playerId, timer);

          // Check if all players disconnected
          const allDisconnected = room.state.players.every((p) => !p.isConnected);
          if (allDisconnected) {
            this.startGcTimer(gameId);
          }

          // Broadcast updated state
          this.broadcastGameState(gameId);
        } else {
          // In-lobby disconnect: remove player from lobby
          this.removePlayerFromLobby(gameId, playerId);
        }
      }
    }
  }

  // ─── Message handling ─────────────────────────────────────────────

  handleMessage(ws: WebSocket, message: ClientMessage): void {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (message.type) {
      case 'lobby:create':
        this.handleLobbyCreate(ws, client, message.playerName, message.difficulty);
        break;
      case 'lobby:join':
        this.handleLobbyJoin(ws, client, message.gameId, message.playerName);
        break;
      case 'lobby:leave':
        this.handleLobbyLeave(ws, client);
        break;
      case 'lobby:start':
        this.handleLobbyStart(ws, client);
        break;
      case 'lobby:set_difficulty':
        this.handleSetDifficulty(ws, client, message.difficulty);
        break;
      case 'lobby:select_role':
        this.handleSelectRole(ws, client, message.role);
        break;
      case 'game:action':
        this.handleGameAction(ws, client, message.action);
        break;
      case 'game:reconnect':
        this.handleReconnect(ws, client, message.gameId, message.playerId, message.secret);
        break;
    }
  }

  // ─── Lobby handlers ───────────────────────────────────────────────

  private handleLobbyCreate(
    ws: WebSocket,
    client: ClientInfo,
    playerName: string,
    difficulty: Difficulty,
  ): void {
    const trimmedName = playerName.trim().slice(0, 20);
    if (!trimmedName) {
      this.send(ws, { type: 'lobby:error', message: 'Name is required.' });
      return;
    }

    const gameId = generateGameId();
    const playerId = client.playerId;

    client.playerName = trimmedName;
    client.gameId = gameId;

    const lobby: LobbyState = {
      gameId,
      hostId: playerId,
      difficulty,
      players: [
        {
          id: playerId,
          name: trimmedName,
          role: null,
          isHost: true,
          isConnected: true,
        },
      ],
      maxPlayers: MAX_PLAYERS,
    };

    const room: GameRoom = {
      gameId,
      lobby,
      state: null,
      playerSecrets: new Map([[playerId, client.secret]]),
      disconnectTimers: new Map(),
      gcTimer: null,
      createdAt: Date.now(),
    };

    this.games.set(gameId, room);

    this.send(ws, {
      type: 'lobby:created',
      gameId,
      lobbyState: lobby,
    });

    this.broadcastGameList();
  }

  private handleLobbyJoin(
    ws: WebSocket,
    client: ClientInfo,
    gameId: string,
    playerName: string,
  ): void {
    const trimmedName = playerName.trim().slice(0, 20);
    if (!trimmedName) {
      this.send(ws, { type: 'lobby:error', message: 'Name is required.' });
      return;
    }

    const room = this.games.get(gameId);
    if (!room) {
      this.send(ws, { type: 'lobby:error', message: 'Game not found.' });
      return;
    }

    if (room.state) {
      this.send(ws, { type: 'lobby:error', message: 'Game already started.' });
      return;
    }

    if (room.lobby.players.length >= room.lobby.maxPlayers) {
      this.send(ws, { type: 'lobby:error', message: 'Game is full.' });
      return;
    }

    const playerId = client.playerId;
    client.playerName = trimmedName;
    client.gameId = gameId;

    room.lobby.players.push({
      id: playerId,
      name: trimmedName,
      role: null,
      isHost: false,
      isConnected: true,
    });

    room.playerSecrets.set(playerId, client.secret);

    this.broadcastToGame(gameId, {
      type: 'lobby:updated',
      lobbyState: room.lobby,
    });

    this.broadcastGameList();
  }

  private handleLobbyLeave(ws: WebSocket, client: ClientInfo): void {
    const { gameId, playerId } = client;
    if (!gameId) return;

    client.gameId = null;
    this.removePlayerFromLobby(gameId, playerId);
  }

  private removePlayerFromLobby(gameId: string, playerId: string): void {
    const room = this.games.get(gameId);
    if (!room || room.state) return;

    room.lobby.players = room.lobby.players.filter((p) => p.id !== playerId);
    room.playerSecrets.delete(playerId);

    if (room.lobby.players.length === 0) {
      // No players left, remove the game
      this.games.delete(gameId);
      this.broadcastGameList();
      return;
    }

    // Transfer host if the host left
    if (room.lobby.hostId === playerId) {
      room.lobby.hostId = room.lobby.players[0].id;
      room.lobby.players[0] = { ...room.lobby.players[0], isHost: true };
    }

    this.broadcastToGame(gameId, {
      type: 'lobby:updated',
      lobbyState: room.lobby,
    });

    this.broadcastGameList();
  }

  private handleLobbyStart(ws: WebSocket, client: ClientInfo): void {
    const { gameId, playerId } = client;
    if (!gameId) return;

    const room = this.games.get(gameId);
    if (!room) return;

    if (room.lobby.hostId !== playerId) {
      this.send(ws, { type: 'lobby:error', message: 'Only the host can start.' });
      return;
    }

    const players = room.lobby.players;
    if (players.length < MIN_PLAYERS) {
      this.send(ws, { type: 'lobby:error', message: `Need at least ${MIN_PLAYERS} players.` });
      return;
    }

    const allHaveRoles = players.every((p) => p.role !== null);
    if (!allHaveRoles) {
      this.send(ws, { type: 'lobby:error', message: 'All players must select a role.' });
      return;
    }

    // Setup game
    const gameState = setupGame({
      gameId,
      difficulty: room.lobby.difficulty,
      playerInfos: players.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role!,
      })),
    });

    room.state = gameState;

    // Send personalized game state to each player
    for (const player of players) {
      const playerWs = this.playerToWs.get(player.id);
      if (playerWs) {
        this.send(playerWs, {
          type: 'game:started',
          gameState: toClientState(gameState, player.id),
        });
      }
    }

    this.broadcastGameList();
  }

  private handleSetDifficulty(
    ws: WebSocket,
    client: ClientInfo,
    difficulty: Difficulty,
  ): void {
    const { gameId, playerId } = client;
    if (!gameId) return;

    const room = this.games.get(gameId);
    if (!room || room.state) return;

    if (room.lobby.hostId !== playerId) {
      this.send(ws, { type: 'lobby:error', message: 'Only the host can change difficulty.' });
      return;
    }

    room.lobby.difficulty = difficulty;

    this.broadcastToGame(gameId, {
      type: 'lobby:updated',
      lobbyState: room.lobby,
    });
  }

  private handleSelectRole(
    ws: WebSocket,
    client: ClientInfo,
    role: RoleName,
  ): void {
    const { gameId, playerId } = client;
    if (!gameId) return;

    const room = this.games.get(gameId);
    if (!room || room.state) return;

    // Check if role is already taken by another player
    const roleTaken = room.lobby.players.some(
      (p) => p.role === role && p.id !== playerId,
    );
    if (roleTaken) {
      this.send(ws, { type: 'lobby:error', message: 'Role already taken.' });
      return;
    }

    room.lobby.players = room.lobby.players.map((p) =>
      p.id === playerId ? { ...p, role } : p,
    );

    this.broadcastToGame(gameId, {
      type: 'lobby:updated',
      lobbyState: room.lobby,
    });
  }

  // ─── Game action handler ──────────────────────────────────────────

  private handleGameAction(
    ws: WebSocket,
    client: ClientInfo,
    action: GameAction,
  ): void {
    const { gameId, playerId } = client;
    if (!gameId) return;

    const room = this.games.get(gameId);
    if (!room || !room.state) return;

    const result = processAction(room.state, playerId, action);
    room.state = result.state;

    // Broadcast animation events first
    for (const event of result.events) {
      if (event.type !== 'game:state') {
        this.broadcastToGame(gameId, event);
      }
    }

    // Then broadcast full personalized state to each player
    this.broadcastGameState(gameId);
  }

  // ─── Reconnection ────────────────────────────────────────────────

  private handleReconnect(
    ws: WebSocket,
    client: ClientInfo,
    gameId: string,
    reconnectPlayerId: string,
    secret: string,
  ): void {
    const room = this.games.get(gameId);
    if (!room) {
      this.send(ws, { type: 'lobby:error', message: 'Game not found.' });
      return;
    }

    const storedSecret = room.playerSecrets.get(reconnectPlayerId);
    if (storedSecret !== secret) {
      this.send(ws, { type: 'lobby:error', message: 'Invalid credentials.' });
      return;
    }

    // Re-associate this WebSocket with the player
    const oldWs = this.playerToWs.get(reconnectPlayerId);
    if (oldWs) {
      this.clients.delete(oldWs);
    }

    this.playerToWs.set(reconnectPlayerId, ws);
    client.playerId = reconnectPlayerId;
    client.gameId = gameId;
    client.secret = secret;

    // Clear disconnect timer
    const timer = room.disconnectTimers.get(reconnectPlayerId);
    if (timer) {
      clearTimeout(timer);
      room.disconnectTimers.delete(reconnectPlayerId);
    }

    // Clear GC timer
    if (room.gcTimer) {
      clearTimeout(room.gcTimer);
      room.gcTimer = null;
    }

    // Mark player as connected
    if (room.state) {
      room.state = {
        ...room.state,
        players: room.state.players.map((p) =>
          p.id === reconnectPlayerId ? { ...p, isConnected: true } : p,
        ),
      };

      // Send full state to reconnecting player
      this.send(ws, {
        type: 'game:state',
        gameState: toClientState(room.state, reconnectPlayerId),
      });

      // Broadcast reconnection
      this.broadcastToGame(gameId, {
        type: 'game:player_reconnected',
        playerId: reconnectPlayerId,
      });
    } else {
      // Reconnecting to lobby
      room.lobby.players = room.lobby.players.map((p) =>
        p.id === reconnectPlayerId ? { ...p, isConnected: true } : p,
      );
      this.send(ws, {
        type: 'lobby:updated',
        lobbyState: room.lobby,
      });
    }
  }

  // ─── Disconnect timeout ───────────────────────────────────────────

  private handleDisconnectTimeout(gameId: string, playerId: string): void {
    const room = this.games.get(gameId);
    if (!room || !room.state) return;

    room.disconnectTimers.delete(playerId);

    // If it's the disconnected player's turn, skip it
    const currentPlayer = room.state.players[room.state.currentPlayerIndex];
    if (currentPlayer && currentPlayer.id === playerId && !currentPlayer.isConnected) {
      const result = skipDisconnectedTurn(room.state);
      room.state = result.state;

      for (const event of result.events) {
        this.broadcastToGame(gameId, event);
      }

      this.broadcastGameState(gameId);
    }
  }

  private startGcTimer(gameId: string): void {
    const room = this.games.get(gameId);
    if (!room) return;

    if (room.gcTimer) clearTimeout(room.gcTimer);

    room.gcTimer = setTimeout(() => {
      this.games.delete(gameId);
    }, GAME_GC_TIMEOUT_MS);
  }

  // ─── Broadcasting ─────────────────────────────────────────────────

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastToGame(gameId: string, message: ServerMessage): void {
    const room = this.games.get(gameId);
    if (!room) return;

    const playerIds = room.state
      ? room.state.players.map((p) => p.id)
      : room.lobby.players.map((p) => p.id);

    for (const pid of playerIds) {
      const ws = this.playerToWs.get(pid);
      if (ws) {
        this.send(ws, message);
      }
    }
  }

  private broadcastGameState(gameId: string): void {
    const room = this.games.get(gameId);
    if (!room || !room.state) return;

    for (const player of room.state.players) {
      const ws = this.playerToWs.get(player.id);
      if (ws) {
        this.send(ws, {
          type: 'game:state',
          gameState: toClientState(room.state, player.id),
        });
      }
    }
  }

  broadcastGameList(): void {
    const games = this.getOpenGames();
    const message: ServerMessage = {
      type: 'lobby:game_list_updated',
      games,
    };

    // Send to all connected clients not in a game
    for (const [ws, client] of this.clients) {
      if (!client.gameId) {
        this.send(ws, message);
      }
    }
  }

  // ─── REST helpers ─────────────────────────────────────────────────

  getOpenGames(): GameListEntry[] {
    const games: GameListEntry[] = [];

    for (const [, room] of this.games) {
      if (!room.state && room.lobby.players.length < room.lobby.maxPlayers) {
        const host = room.lobby.players.find((p) => p.isHost);
        games.push({
          gameId: room.gameId,
          hostName: host?.name ?? 'Unknown',
          playerCount: room.lobby.players.length,
          maxPlayers: room.lobby.maxPlayers,
          difficulty: room.lobby.difficulty,
        });
      }
    }

    return games;
  }

  getGameLobby(gameId: string): LobbyState | null {
    const room = this.games.get(gameId);
    if (!room) return null;
    return room.lobby;
  }
}
