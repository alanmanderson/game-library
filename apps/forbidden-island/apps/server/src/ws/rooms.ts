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
import { shuffle } from '../utils/shuffle.js';
import type { GameStore } from '../persistence/game-store.js';

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
  private store: GameStore | null = null;

  /** Attach a persistent store and load saved games. */
  async initStore(store: GameStore): Promise<void> {
    this.store = store;
    await store.init();
    const rows = await store.loadAll();
    for (const row of rows) {
      const room: GameRoom = {
        gameId: row.gameId,
        lobby: row.lobby,
        state: row.state,
        playerSecrets: new Map(Object.entries(row.playerSecrets)),
        disconnectTimers: new Map(),
        gcTimer: null,
        createdAt: row.createdAt,
      };
      // Mark all players as disconnected (they'll reconnect via game:reconnect)
      if (room.state) {
        room.state = {
          ...room.state,
          players: room.state.players.map((p) => ({ ...p, isConnected: false })),
        };
      }
      this.games.set(row.gameId, room);
    }
    if (rows.length > 0) {
      console.log(`Loaded ${rows.length} game(s) from database`);
    }
  }

  /** Persist a game room to the store (fire-and-forget). */
  private persist(room: GameRoom): void {
    if (!this.store) return;
    this.store.save({
      gameId: room.gameId,
      lobby: room.lobby,
      state: room.state,
      playerSecrets: Object.fromEntries(room.playerSecrets),
      createdAt: room.createdAt,
    }).catch((err) => console.error('Failed to persist game:', err));
  }

  /** Persist only the game state (hot path). */
  private persistState(gameId: string, state: GameState | null): void {
    if (!this.store) return;
    this.store.updateState(gameId, state).catch((err) =>
      console.error('Failed to persist state:', err),
    );
  }

  /** Remove a game from the store. */
  private unpersist(gameId: string): void {
    if (!this.store) return;
    this.store.delete(gameId).catch((err) =>
      console.error('Failed to delete game:', err),
    );
  }

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

    // Send current game list so the client sees open games immediately
    const games = this.getOpenGames();
    if (games.length > 0) {
      this.send(ws, {
        type: 'lobby:game_list_updated',
        games,
      });
    }
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
      case 'lobby:create_solo':
        this.handleCreateSolo(ws, client, message.playerName, message.difficulty, message.playerCount);
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
    this.persist(room);

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
    this.persist(room);

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
      this.unpersist(gameId);
      this.broadcastGameList();
      return;
    }

    // Transfer host if the host left
    if (room.lobby.hostId === playerId) {
      room.lobby.hostId = room.lobby.players[0].id;
      room.lobby.players[0] = { ...room.lobby.players[0], isHost: true };
    }

    this.persist(room);

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

    // Randomly assign roles to all players
    const allRoles: RoleName[] = ['explorer', 'diver', 'engineer', 'pilot', 'messenger', 'navigator'];
    const shuffledRoles = shuffle(allRoles);
    const assignedPlayers = players.map((p, i) => ({
      ...p,
      role: shuffledRoles[i],
    }));
    room.lobby.players = assignedPlayers;

    // Setup game
    const gameState = setupGame({
      gameId,
      difficulty: room.lobby.difficulty,
      playerInfos: assignedPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role!,
      })),
    });

    room.state = gameState;
    this.persist(room);

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
    this.persist(room);

    this.broadcastToGame(gameId, {
      type: 'lobby:updated',
      lobbyState: room.lobby,
    });
  }

  private handleSelectRole(
    _ws: WebSocket,
    _client: ClientInfo,
    _role: RoleName,
  ): void {
    // Roles are randomly assigned at game start — manual selection is disabled.
  }

  // ─── Solo game creation ───────────────────────────────────────────

  private static readonly SOLO_PLAYER_NAMES = [
    'Captain Ava', 'Dr. Chen', 'Commander Reef', 'Navigator Kai',
  ];

  private handleCreateSolo(
    ws: WebSocket,
    client: ClientInfo,
    playerName: string,
    difficulty: Difficulty,
    playerCount: number,
  ): void {
    const trimmedName = playerName.trim().slice(0, 20);
    if (!trimmedName) {
      this.send(ws, { type: 'lobby:error', message: 'Name is required.' });
      return;
    }

    if (playerCount < 2 || playerCount > 4) {
      this.send(ws, { type: 'lobby:error', message: 'Player count must be 2-4.' });
      return;
    }

    const gameId = generateGameId();
    const soloPlayerId = client.playerId;

    client.playerName = trimmedName;
    client.gameId = gameId;

    // Generate virtual player IDs for each adventurer
    const virtualPlayerIds = Array.from({ length: playerCount }, () => generatePlayerId());

    // Randomly assign roles
    const allRoles: RoleName[] = ['explorer', 'diver', 'engineer', 'pilot', 'messenger', 'navigator'];
    const shuffledRoles = shuffle(allRoles).slice(0, playerCount);

    // Build player names: first player uses the real name, rest get NPC names
    const soloNames = [trimmedName, ...RoomManager.SOLO_PLAYER_NAMES];

    const playerInfos = virtualPlayerIds.map((id, i) => ({
      id,
      name: soloNames[i],
      role: shuffledRoles[i],
    }));

    // Build lobby state (for bookkeeping)
    const lobby: LobbyState = {
      gameId,
      hostId: soloPlayerId,
      difficulty,
      players: playerInfos.map((p, i) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        isHost: i === 0,
        isConnected: true,
      })),
      maxPlayers: playerCount,
    };

    // Setup the game immediately
    const gameState = setupGame({
      gameId,
      difficulty,
      playerInfos,
    });
    gameState.soloPlayerId = soloPlayerId;

    const room: GameRoom = {
      gameId,
      lobby,
      state: gameState,
      playerSecrets: new Map([[soloPlayerId, client.secret]]),
      disconnectTimers: new Map(),
      gcTimer: null,
      createdAt: Date.now(),
    };

    this.games.set(gameId, room);
    this.persist(room);

    // Send game started directly (skip lobby phase)
    this.send(ws, {
      type: 'game:started',
      gameState: toClientState(gameState, soloPlayerId),
    });

    this.broadcastGameList();
  }

  // ─── Game action handler ──────────────────────────────────────────

  /**
   * In solo mode, determine which game player is acting based on the action
   * and current game phase. The solo player controls all adventurers.
   */
  private resolveSoloActingPlayer(state: GameState, action: GameAction): string {
    // Discard phase → the player who must discard
    if (action.type === 'discard' && state.discardingPlayerId) {
      return state.discardingPlayerId;
    }
    // Swim phase → the player who must swim
    if (action.type === 'swim' && state.swimmingPlayerId) {
      return state.swimmingPlayerId;
    }
    // Special cards → find who owns the card
    if (action.type === 'play_helicopter_lift' || action.type === 'play_sandbags') {
      const cardId = action.cardId;
      const owner = state.players.find((p) => p.hand.some((c) => c.id === cardId));
      if (owner) return owner.id;
    }
    // Default: current turn player
    return state.players[state.currentPlayerIndex].id;
  }

  private handleGameAction(
    ws: WebSocket,
    client: ClientInfo,
    action: GameAction,
  ): void {
    const { gameId, playerId } = client;
    if (!gameId) return;

    const room = this.games.get(gameId);
    if (!room || !room.state) return;

    // In solo mode, map the solo player's real ID to the appropriate game player
    let actingPlayerId = playerId;
    if (room.state.soloPlayerId && room.state.soloPlayerId === playerId) {
      actingPlayerId = this.resolveSoloActingPlayer(room.state, action);
    }

    const result = processAction(room.state, actingPlayerId, action);
    room.state = result.state;
    this.persistState(gameId, room.state);

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
      const isSolo = room.state.soloPlayerId === reconnectPlayerId;
      room.state = {
        ...room.state,
        players: room.state.players.map((p) =>
          // In solo mode, reconnecting the solo player reconnects all virtual players
          (isSolo || p.id === reconnectPlayerId) ? { ...p, isConnected: true } : p,
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
      this.persistState(gameId, room.state);

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
      this.unpersist(gameId);
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

    // Solo mode: send only to the solo player
    if (room.state?.soloPlayerId) {
      const ws = this.playerToWs.get(room.state.soloPlayerId);
      if (ws) {
        this.send(ws, message);
      }
      return;
    }

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

    // Solo mode: send state to the solo player directly
    if (room.state.soloPlayerId) {
      const ws = this.playerToWs.get(room.state.soloPlayerId);
      if (ws) {
        this.send(ws, {
          type: 'game:state',
          gameState: toClientState(room.state, room.state.soloPlayerId),
        });
      }
      return;
    }

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
