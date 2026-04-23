import { v4 as uuidv4 } from "uuid";
import crypto from "node:crypto";
import type { Server, Socket } from "socket.io";
import type {
  Game,
  GameSettings,
  GameState,
  Player,
  PlayerPublic,
  GameStatePayload,
  RoundStartPayload,
  ReviewEntryPayload,
  ChainEntryType,
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from "../models/types.js";
import { GameStore } from "./GameStore.js";
import { TimerService } from "./TimerService.js";
import { getRoundType, hasMoreRounds, getNextStateAfterRound } from "./StateMachine.js";
import {
  getChainIndexForPlayer,
  getInputForPlayer,
  initializeChains,
  addEntryToChain,
  getEntryTypeForRound,
} from "./ChainManager.js";
import { getRandomWord } from "./WordList.js";
import { generateUniqueGameCode } from "../utils/codeGenerator.js";
import { sanitizeHtml } from "../utils/sanitize.js";
import { config } from "../config.js";

type TypedIO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

function generateReconnectionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function toPlayerPublic(p: Player): PlayerPublic {
  return {
    id: p.id,
    displayName: p.displayName,
    isHost: p.isHost,
    isConnected: p.isConnected,
  };
}

export class GameManager {
  private store: GameStore;
  private timers: TimerService;
  private io: TypedIO | null = null;
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(store: GameStore, timers: TimerService) {
    this.store = store;
    this.timers = timers;
  }

  setIO(io: TypedIO): void {
    this.io = io;
  }

  getStore(): GameStore {
    return this.store;
  }

  getTimers(): TimerService {
    return this.timers;
  }

  // --------------- Periodic sweep ---------------

  startPeriodicSweep(): void {
    this.sweepInterval = setInterval(() => {
      this.runSweep();
    }, config.periodicSweepIntervalMs);
  }

  stopPeriodicSweep(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  private runSweep(): void {
    const now = Date.now();
    for (const game of this.store.getAll()) {
      // ENDED games past their cleanup window
      if (game.state === "ENDED" && game.endedAt && now - game.endedAt > config.endedGameCleanupMs) {
        this.deleteGame(game.id);
        continue;
      }
      // LOBBY with no connected players for too long
      if (game.state === "LOBBY") {
        const hasConnected = game.players.some(p => p.isConnected);
        if (!hasConnected && now - game.createdAt > config.lobbyNoPlayersCleanupMs) {
          this.deleteGame(game.id);
          continue;
        }
      }
      // Active games with no connected players
      if (["PROMPT", "DRAWING", "GUESSING", "REVIEW"].includes(game.state)) {
        const hasConnected = game.players.some(p => p.isConnected);
        if (!hasConnected) {
          // The empty-game cleanup timer should have been started by disconnect handler.
          // This is the safety net.
          this.deleteGame(game.id);
        }
      }
    }
  }

  private deleteGame(gameId: string): void {
    this.timers.clearAll(gameId);
    this.store.delete(gameId);
  }

  // --------------- Game creation ---------------

  createGame(
    hostDisplayName: string,
    settings?: Partial<GameSettings>
  ): { game: Game; hostPlayer: Player } {
    const gameId = uuidv4();
    const code = generateUniqueGameCode((c) => this.store.isCodeInUse(c));
    const playerId = uuidv4();
    const token = generateReconnectionToken();

    const resolvedSettings: GameSettings = {
      drawingTimerSeconds: settings?.drawingTimerSeconds ?? config.defaultDrawingTimer,
      guessingTimerSeconds: settings?.guessingTimerSeconds ?? config.defaultGuessingTimer,
      promptTimerSeconds: settings?.promptTimerSeconds ?? config.defaultPromptTimer,
      useAllRounds: settings?.useAllRounds ?? true,
      customRoundCount: settings?.customRoundCount ?? null,
    };

    const hostPlayer: Player = {
      id: playerId,
      displayName: sanitizeHtml(hostDisplayName.trim()),
      isHost: true,
      isConnected: false, // becomes connected when socket connects
      reconnectionToken: token,
      joinOrder: 0,
      orderIndex: null,
      socketId: null,
    };

    const game: Game = {
      id: gameId,
      code,
      state: "LOBBY",
      hostPlayerId: playerId,
      settings: resolvedSettings,
      players: [hostPlayer],
      chains: [],
      currentRound: 0,
      totalRounds: 0,
      roundStartedAt: null,
      roundEndsAt: null,
      submittedPlayerIds: new Set(),
      reviewCursor: null,
      createdAt: Date.now(),
      endedAt: null,
    };

    this.store.create(game);
    return { game, hostPlayer };
  }

  // --------------- Join ---------------

  joinGame(
    code: string,
    displayName: string
  ): { game: Game; player: Player } {
    const game = this.store.getByCode(code.toUpperCase());
    if (!game) {
      throw new GameError("GAME_NOT_FOUND", "Game not found. Check your code and try again.", 404);
    }
    if (game.state !== "LOBBY") {
      throw new GameError("GAME_ALREADY_STARTED", "This game has already started.", 409);
    }
    if (game.players.length >= config.maxPlayers) {
      throw new GameError("GAME_FULL", "This game is full.", 409);
    }

    const sanitizedName = sanitizeHtml(displayName.trim());
    const nameTaken = game.players.some(
      (p) => p.displayName.toLowerCase() === sanitizedName.toLowerCase()
    );
    if (nameTaken) {
      throw new GameError("DISPLAY_NAME_TAKEN", "That name is already taken. Choose a different name.", 409);
    }

    const playerId = uuidv4();
    const token = generateReconnectionToken();

    const player: Player = {
      id: playerId,
      displayName: sanitizedName,
      isHost: false,
      isConnected: false,
      reconnectionToken: token,
      joinOrder: game.players.length,
      orderIndex: null,
      socketId: null,
    };

    game.players.push(player);

    return { game, player };
  }

  // --------------- Socket connection ---------------

  handlePlayerConnect(
    gameCode: string,
    playerId: string,
    reconnectionToken: string,
    socketId: string
  ): { game: Game; player: Player } {
    const game = this.store.getByCode(gameCode);
    if (!game) {
      throw new GameError("GAME_NOT_FOUND", "Game not found or has ended.", 404);
    }

    const player = game.players.find((p) => p.id === playerId);
    if (!player) {
      throw new GameError("PLAYER_NOT_FOUND", "Player not found in this game.", 404);
    }

    if (player.reconnectionToken !== reconnectionToken) {
      throw new GameError("INVALID_TOKEN", "Reconnection token is invalid.", 401);
    }

    // Handle duplicate connection: disconnect old socket
    if (player.socketId && this.io) {
      const oldSocket = this.io.sockets.sockets.get(player.socketId);
      if (oldSocket) {
        oldSocket.emit("error", {
          code: "SESSION_REPLACED",
          message: "Your session has been replaced by a new connection.",
        });
        oldSocket.disconnect(true);
      }
    }

    player.isConnected = true;
    player.socketId = socketId;

    // Clear any disconnect timer for this player
    this.timers.clearDisconnectTimer(game.id, playerId);

    // Clear the empty-game cleanup timer if it was running
    this.timers.clearCleanupTimer(game.id);

    return { game, player };
  }

  // --------------- Disconnect ---------------

  handlePlayerDisconnect(socketId: string): void {
    // Find the game + player for this socket
    for (const game of this.store.getAll()) {
      const player = game.players.find((p) => p.socketId === socketId);
      if (!player) continue;

      player.isConnected = false;
      player.socketId = null;

      // Emit player left (disconnected) to the room
      if (this.io) {
        this.io.to(game.code).emit("game:player-left", {
          playerId: player.id,
          displayName: player.displayName,
          reason: "disconnected",
          playerCount: game.players.filter((p) => p.isConnected).length,
          removedFromGame: false,
        });
      }

      // Start disconnect timer
      this.timers.startDisconnectTimer(
        game.id,
        player.id,
        config.disconnectTimeoutMs,
        () => this.handleDisconnectTimeout(game.id, player.id)
      );

      // If no players connected, start empty-game cleanup timer
      const anyConnected = game.players.some((p) => p.isConnected);
      if (!anyConnected && game.state !== "LOBBY") {
        this.timers.startCleanupTimer(game.id, config.emptyGameCleanupMs, () => {
          this.deleteGame(game.id);
        });
      } else if (!anyConnected && game.state === "LOBBY") {
        // Lobby with no players: delete immediately after short delay
        this.timers.startCleanupTimer(game.id, config.lobbyNoPlayersCleanupMs, () => {
          this.deleteGame(game.id);
        });
      }

      return;
    }
  }

  private handleDisconnectTimeout(gameId: string, playerId: string): void {
    const game = this.store.getById(gameId);
    if (!game) return;

    const player = game.players.find((p) => p.id === playerId);
    if (!player || player.isConnected) return;

    // Mark as permanently disconnected
    player.leftVoluntarily = true;

    if (this.io) {
      this.io.to(game.code).emit("game:player-left", {
        playerId: player.id,
        displayName: player.displayName,
        reason: "timeout",
        playerCount: game.players.filter((p) => p.isConnected).length,
        removedFromGame: game.state === "LOBBY",
      });
    }

    // Remove from lobby entirely
    if (game.state === "LOBBY") {
      game.players = game.players.filter((p) => p.id !== playerId);
    }

    // Transfer host if needed
    if (player.isHost) {
      this.transferHost(game, "timeout");
    }

    // Auto-submit for active rounds if the player hasn't submitted
    if (
      ["PROMPT", "DRAWING", "GUESSING"].includes(game.state) &&
      !game.submittedPlayerIds.has(playerId)
    ) {
      this.autoSubmitForPlayer(game, player);
    }
  }

  // --------------- Leave ---------------

  handlePlayerLeave(game: Game, player: Player): void {
    player.isConnected = false;
    player.socketId = null;
    player.leftVoluntarily = true;

    // Invalidate reconnection token
    player.reconnectionToken = "";

    this.timers.clearDisconnectTimer(game.id, player.id);

    // Transfer host BEFORE removing the player so the candidate list is correct
    if (player.isHost) {
      this.transferHost(game, "left");
    }

    if (game.state === "LOBBY") {
      // Remove entirely from the game
      game.players = game.players.filter((p) => p.id !== player.id);

      if (this.io) {
        this.io.to(game.code).emit("game:player-left", {
          playerId: player.id,
          displayName: player.displayName,
          reason: "left",
          playerCount: game.players.length,
          removedFromGame: true,
        });
      }
    } else if (["PROMPT", "DRAWING", "GUESSING"].includes(game.state)) {
      // Auto-submit for current round if needed
      if (!game.submittedPlayerIds.has(player.id)) {
        this.autoSubmitForPlayer(game, player);
      }

      if (this.io) {
        this.io.to(game.code).emit("game:player-left", {
          playerId: player.id,
          displayName: player.displayName,
          reason: "left",
          playerCount: game.players.filter((p) => p.isConnected).length,
          removedFromGame: false,
        });
      }
    } else {
      if (this.io) {
        this.io.to(game.code).emit("game:player-left", {
          playerId: player.id,
          displayName: player.displayName,
          reason: "left",
          playerCount: game.players.filter((p) => p.isConnected).length,
          removedFromGame: false,
        });
      }
    }

    // If lobby is empty, delete
    if (game.state === "LOBBY" && game.players.length === 0) {
      this.deleteGame(game.id);
    }
  }

  // --------------- Kick ---------------

  handleKick(game: Game, hostPlayer: Player, targetPlayerId: string): void {
    if (!hostPlayer.isHost) {
      throw new GameError("NOT_HOST", "Only the host can kick players.", 403);
    }
    if (game.state !== "LOBBY") {
      throw new GameError("INVALID_STATE", "Can only kick players in the lobby.", 409);
    }

    const target = game.players.find((p) => p.id === targetPlayerId);
    if (!target) {
      throw new GameError("PLAYER_NOT_FOUND", "Player not found.", 404);
    }
    if (target.isHost) {
      throw new GameError("CANNOT_KICK_HOST", "Cannot kick the host.", 409);
    }

    // Disconnect their socket
    if (target.socketId && this.io) {
      const socket = this.io.sockets.sockets.get(target.socketId);
      if (socket) {
        socket.emit("error", {
          code: "KICKED",
          message: "You have been removed from the game by the host.",
        });
        socket.leave(game.code);
        socket.disconnect(true);
      }
    }

    // Invalidate token
    target.reconnectionToken = "";

    // Remove from game
    game.players = game.players.filter((p) => p.id !== targetPlayerId);

    if (this.io) {
      this.io.to(game.code).emit("game:player-left", {
        playerId: target.id,
        displayName: target.displayName,
        reason: "kicked",
        playerCount: game.players.length,
        removedFromGame: true,
      });
    }
  }

  // --------------- Settings ---------------

  handleSettingsUpdate(
    game: Game,
    player: Player,
    updates: Partial<GameSettings>
  ): void {
    if (!player.isHost) {
      throw new GameError("NOT_HOST", "Only the host can change settings.", 403);
    }
    if (game.state !== "LOBBY") {
      throw new GameError("INVALID_STATE", "Settings can only be changed in the lobby.", 409);
    }

    if (updates.drawingTimerSeconds !== undefined) {
      game.settings.drawingTimerSeconds = updates.drawingTimerSeconds;
    }
    if (updates.guessingTimerSeconds !== undefined) {
      game.settings.guessingTimerSeconds = updates.guessingTimerSeconds;
    }
    if (updates.promptTimerSeconds !== undefined) {
      game.settings.promptTimerSeconds = updates.promptTimerSeconds;
    }
    if (updates.useAllRounds !== undefined) {
      game.settings.useAllRounds = updates.useAllRounds;
    }
    if (updates.customRoundCount !== undefined) {
      game.settings.customRoundCount = updates.customRoundCount;
    }
  }

  // --------------- Start game ---------------

  startGame(game: Game, player: Player): void {
    if (!player.isHost) {
      throw new GameError("NOT_HOST", "Only the host can start the game.", 403);
    }
    if (game.state !== "LOBBY") {
      throw new GameError("INVALID_STATE", "Game is not in the lobby.", 409);
    }

    const connectedCount = game.players.filter((p) => p.isConnected).length;
    if (connectedCount < config.minPlayers) {
      throw new GameError(
        "NOT_ENOUGH_PLAYERS",
        `Need at least ${config.minPlayers} players to start.`,
        409
      );
    }

    // Assign order indices based on join order
    // Only include connected players? No -- per spec, all joined players participate.
    // The product spec says the player list is locked at start.
    game.players.sort((a, b) => a.joinOrder - b.joinOrder);
    for (let i = 0; i < game.players.length; i++) {
      game.players[i].orderIndex = i;
    }

    // Calculate rounds
    const playerCount = game.players.length;
    let roundCount: number;
    if (game.settings.useAllRounds) {
      roundCount = playerCount - 1;
    } else {
      roundCount = game.settings.customRoundCount ?? playerCount - 1;
      if (roundCount > playerCount - 1) {
        roundCount = playerCount - 1;
      }
      if (roundCount < 2) {
        roundCount = 2;
      }
    }

    game.totalRounds = roundCount + 1; // +1 for the prompt phase (round 0)
    game.currentRound = 0;
    game.chains = initializeChains(playerCount);
    game.submittedPlayerIds = new Set();
    game.state = "PROMPT";

    if (this.io) {
      // Emit game:started to all
      this.io.to(game.code).emit("game:started", {
        totalRounds: roundCount,
        playerOrder: game.players.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          orderIndex: p.orderIndex!,
        })),
      });
    }

    // Start the prompt round
    this.startRound(game);
  }

  // --------------- Round management ---------------

  private startRound(game: Game): void {
    const roundType = getRoundType(game.currentRound);
    let timerSeconds: number;

    switch (roundType) {
      case "PROMPT":
        timerSeconds = game.settings.promptTimerSeconds;
        break;
      case "DRAWING":
        timerSeconds = game.settings.drawingTimerSeconds;
        break;
      case "GUESSING":
        timerSeconds = game.settings.guessingTimerSeconds;
        break;
    }

    const timerDurationMs = timerSeconds * 1000;
    const now = Date.now();
    game.roundStartedAt = now;
    game.roundEndsAt = now + timerDurationMs;
    game.submittedPlayerIds = new Set();

    // Auto-submit for disconnected players immediately
    for (const player of game.players) {
      if (!player.isConnected && (player.leftVoluntarily || !player.reconnectionToken)) {
        this.autoSubmitForPlayer(game, player);
      }
    }

    // Emit round:start to each player individually (different content per player)
    if (this.io) {
      for (const player of game.players) {
        if (!player.socketId) continue;

        const socket = this.io.sockets.sockets.get(player.socketId);
        if (!socket) continue;

        const input = getInputForPlayer(game, player.orderIndex!, game.currentRound);

        const payload: RoundStartPayload = {
          round: game.currentRound,
          totalRounds: game.totalRounds,
          type: roundType,
          timerDurationMs,
          timerStartedAt: new Date(now).toISOString(),
          ...(input.prompt !== undefined && { prompt: input.prompt }),
          ...(input.promptAuthorDisplayName !== undefined && {
            promptAuthorDisplayName: input.promptAuthorDisplayName,
          }),
          ...(input.drawing !== undefined && { drawing: input.drawing }),
          ...(input.drawingAuthorDisplayName !== undefined && {
            drawingAuthorDisplayName: input.drawingAuthorDisplayName,
          }),
        };

        socket.emit("round:start", payload);
      }
    }

    // Start server timer (duration + grace period)
    this.timers.startRoundTimer(
      game.id,
      timerDurationMs + config.gracePeriodMs,
      () => this.handleTimerExpired(game.id)
    );

    // Start tick interval for clock sync
    this.timers.startTickInterval(game.id, config.tickIntervalMs, () => {
      if (!game.roundEndsAt) return;
      const remaining = Math.max(0, game.roundEndsAt - Date.now());
      if (this.io) {
        this.io.to(game.code).emit("round:tick", { remainingMs: remaining });
      }
    });

    // Check if all players already submitted (all disconnected)
    this.checkAllSubmitted(game);
  }

  handleSubmission(game: Game, player: Player, content: string): void {
    if (!["PROMPT", "DRAWING", "GUESSING"].includes(game.state)) {
      throw new GameError("INVALID_STATE", "Not in an active round.", 409);
    }
    if (game.submittedPlayerIds.has(player.id)) {
      throw new GameError("ALREADY_SUBMITTED", "You have already submitted for this round.", 409);
    }

    // Check timer (with grace period)
    if (game.roundEndsAt && Date.now() > game.roundEndsAt + config.gracePeriodMs) {
      throw new GameError("ROUND_EXPIRED", "The round timer has expired.", 410);
    }

    const entryType = getEntryTypeForRound(game.currentRound);

    // Validate and sanitize content based on type
    let sanitizedContent = content;
    if (entryType === "DRAWING") {
      // Validate drawing
      if (!content.startsWith("data:image/png;base64,")) {
        throw new GameError("INVALID_CONTENT", "Drawing must be a PNG data URI.", 400);
      }
      const base64Part = content.replace("data:image/png;base64,", "");
      const sizeInBytes = Math.ceil(base64Part.length * 3 / 4);
      if (sizeInBytes > config.maxDrawingSizeBytes) {
        throw new GameError("CONTENT_TOO_LARGE", "Drawing must be smaller than 500KB.", 413);
      }
    } else {
      // Text content: sanitize
      sanitizedContent = sanitizeHtml(content.trim());
      if (sanitizedContent.length === 0) {
        if (entryType === "PROMPT") {
          sanitizedContent = getRandomWord();
        } else {
          sanitizedContent = "???";
        }
      }
      if (sanitizedContent.length > config.maxPromptLength) {
        sanitizedContent = sanitizedContent.substring(0, config.maxPromptLength);
      }
    }

    addEntryToChain(game, player.orderIndex!, game.currentRound, {
      type: entryType,
      playerId: player.id,
      playerDisplayName: player.displayName,
      content: sanitizedContent,
      submittedAt: Date.now(),
      wasAutoSubmitted: false,
    });

    game.submittedPlayerIds.add(player.id);

    // Broadcast submission progress
    if (this.io) {
      this.io.to(game.code).emit("round:player-submitted", {
        playerId: player.id,
        displayName: player.displayName,
        submittedCount: game.submittedPlayerIds.size,
        totalPlayers: game.players.length,
      });
    }

    this.checkAllSubmitted(game);
  }

  private autoSubmitForPlayer(game: Game, player: Player): void {
    if (game.submittedPlayerIds.has(player.id)) return;
    if (player.orderIndex === null) return;

    const entryType = getEntryTypeForRound(game.currentRound);
    let content: string;

    switch (entryType) {
      case "PROMPT":
        content = getRandomWord();
        break;
      case "DRAWING":
        // Blank white canvas as a minimal valid PNG data URI
        content = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
        break;
      case "GUESS":
        content = "???";
        break;
    }

    addEntryToChain(game, player.orderIndex, game.currentRound, {
      type: entryType,
      playerId: player.id,
      playerDisplayName: player.displayName,
      content,
      submittedAt: Date.now(),
      wasAutoSubmitted: true,
    });

    game.submittedPlayerIds.add(player.id);

    if (this.io) {
      this.io.to(game.code).emit("round:player-submitted", {
        playerId: player.id,
        displayName: player.displayName,
        submittedCount: game.submittedPlayerIds.size,
        totalPlayers: game.players.length,
      });
    }
  }

  private checkAllSubmitted(game: Game): void {
    if (game.submittedPlayerIds.size >= game.players.length) {
      this.endRound(game);
    }
  }

  handleEndEarly(game: Game, player: Player): void {
    if (!player.isHost) {
      throw new GameError("NOT_HOST", "Only the host can end the round early.", 403);
    }
    if (!["PROMPT", "DRAWING", "GUESSING"].includes(game.state)) {
      throw new GameError("INVALID_STATE", "Not in an active round.", 409);
    }

    const unsubmittedCount = game.players.length - game.submittedPlayerIds.size;
    if (unsubmittedCount > 1) {
      throw new GameError(
        "CANNOT_END_EARLY",
        "More than one player has not submitted yet.",
        409
      );
    }

    // Auto-submit for remaining players
    for (const p of game.players) {
      if (!game.submittedPlayerIds.has(p.id)) {
        this.autoSubmitForPlayer(game, p);
      }
    }

    this.endRound(game);
  }

  private endRound(game: Game): void {
    // Clear timers
    this.timers.clearRoundTimer(game.id);
    this.timers.clearTickInterval(game.id);

    const currentRound = game.currentRound;
    const moreRounds = hasMoreRounds(game);

    let nextType: "DRAWING" | "GUESSING" | "REVIEW" | null;
    let nextRound: number | null;

    if (moreRounds) {
      const nextRoundNum = currentRound + 1;
      const rt = getRoundType(nextRoundNum);
      nextType = rt === "DRAWING" ? "DRAWING" : "GUESSING";
      nextRound = nextRoundNum;
    } else {
      nextType = "REVIEW";
      nextRound = null;
    }

    if (this.io) {
      this.io.to(game.code).emit("round:ended", {
        roundCompleted: currentRound,
        nextRound,
        nextType,
        transitionDurationMs: config.transitionDurationMs,
      });
    }

    // Start transition timer
    this.timers.startTransitionTimer(game.id, config.transitionDurationMs, () => {
      if (moreRounds) {
        game.currentRound = currentRound + 1;
        game.state = getRoundType(game.currentRound) === "DRAWING" ? "DRAWING" : "GUESSING";
        this.startRound(game);
      } else {
        game.state = "REVIEW";
        game.reviewCursor = { chainIndex: 0, entryIndex: 0 };
        this.emitReviewEntry(game);
      }
    });
  }

  private handleTimerExpired(gameId: string): void {
    const game = this.store.getById(gameId);
    if (!game) return;
    if (!["PROMPT", "DRAWING", "GUESSING"].includes(game.state)) return;

    // Auto-submit for all players who haven't submitted
    for (const player of game.players) {
      if (!game.submittedPlayerIds.has(player.id)) {
        this.autoSubmitForPlayer(game, player);
      }
    }

    this.endRound(game);
  }

  // --------------- Review ---------------

  handleReviewNext(game: Game, player: Player): void {
    if (!player.isHost) {
      throw new GameError("NOT_HOST", "Only the host can control review.", 403);
    }
    if (game.state !== "REVIEW") {
      throw new GameError("INVALID_STATE", "Game is not in review.", 409);
    }
    if (!game.reviewCursor) return;

    const currentChain = game.chains[game.reviewCursor.chainIndex];
    if (!currentChain) return;

    if (game.reviewCursor.entryIndex < currentChain.entries.length - 1) {
      // More entries in current chain
      game.reviewCursor.entryIndex++;
      this.emitReviewEntry(game);
    } else if (game.reviewCursor.chainIndex < game.chains.length - 1) {
      // Move to next chain
      game.reviewCursor.chainIndex++;
      game.reviewCursor.entryIndex = 0;
      this.emitReviewEntry(game);
    } else {
      // All chains reviewed -- end game
      this.endGameFromReview(game);
    }
  }

  handleReviewPrevious(game: Game, player: Player): void {
    if (!player.isHost) {
      throw new GameError("NOT_HOST", "Only the host can control review.", 403);
    }
    if (game.state !== "REVIEW") {
      throw new GameError("INVALID_STATE", "Game is not in review.", 409);
    }
    if (!game.reviewCursor) return;

    if (game.reviewCursor.entryIndex > 0) {
      game.reviewCursor.entryIndex--;
      this.emitReviewEntry(game);
    } else if (game.reviewCursor.chainIndex > 0) {
      game.reviewCursor.chainIndex--;
      const prevChain = game.chains[game.reviewCursor.chainIndex];
      game.reviewCursor.entryIndex = prevChain.entries.length - 1;
      this.emitReviewEntry(game);
    }
    // At very beginning: no-op
  }

  // -- Granular review navigation --

  handleReviewNextEntry(game: Game, player: Player): void {
    if (!player.isHost) {
      throw new GameError("NOT_HOST", "Only the host can control review.", 403);
    }
    if (game.state !== "REVIEW") {
      throw new GameError("INVALID_STATE", "Game is not in review.", 409);
    }
    if (!game.reviewCursor) return;

    const currentChain = game.chains[game.reviewCursor.chainIndex];
    if (!currentChain) return;

    if (game.reviewCursor.entryIndex < currentChain.entries.length - 1) {
      game.reviewCursor.entryIndex++;
      this.emitReviewEntry(game);
    }
    // At last entry of chain: no-op (does NOT cross chain boundaries)
  }

  handleReviewPrevEntry(game: Game, player: Player): void {
    if (!player.isHost) {
      throw new GameError("NOT_HOST", "Only the host can control review.", 403);
    }
    if (game.state !== "REVIEW") {
      throw new GameError("INVALID_STATE", "Game is not in review.", 409);
    }
    if (!game.reviewCursor) return;

    if (game.reviewCursor.entryIndex > 0) {
      game.reviewCursor.entryIndex--;
      this.emitReviewEntry(game);
    }
    // At entry 0: no-op (does NOT cross chain boundaries)
  }

  handleReviewNextChain(game: Game, player: Player): void {
    if (!player.isHost) {
      throw new GameError("NOT_HOST", "Only the host can control review.", 403);
    }
    if (game.state !== "REVIEW") {
      throw new GameError("INVALID_STATE", "Game is not in review.", 409);
    }
    if (!game.reviewCursor) return;

    if (game.reviewCursor.chainIndex < game.chains.length - 1) {
      game.reviewCursor.chainIndex++;
      game.reviewCursor.entryIndex = 0;
      this.emitReviewEntry(game);
    } else {
      // Last chain -- end game
      this.endGameFromReview(game);
    }
  }

  handleReviewPrevChain(game: Game, player: Player): void {
    if (!player.isHost) {
      throw new GameError("NOT_HOST", "Only the host can control review.", 403);
    }
    if (game.state !== "REVIEW") {
      throw new GameError("INVALID_STATE", "Game is not in review.", 409);
    }
    if (!game.reviewCursor) return;

    if (game.reviewCursor.chainIndex > 0) {
      game.reviewCursor.chainIndex--;
      game.reviewCursor.entryIndex = 0;
      this.emitReviewEntry(game);
    }
    // At chain 0: no-op
  }

  private endGameFromReview(game: Game): void {
    game.state = "ENDED";
    game.endedAt = Date.now();

    if (this.io) {
      this.io.to(game.code).emit("game:ended", {
        gameCode: game.code,
        resultsAvailableUntil: new Date(
          Date.now() + config.endedGameCleanupMs
        ).toISOString(),
      });
    }

    // Start cleanup timer
    this.timers.startCleanupTimer(game.id, config.endedGameCleanupMs, () => {
      this.deleteGame(game.id);
    });
  }

  private emitReviewEntry(game: Game): void {
    if (!game.reviewCursor || !this.io) return;

    const chain = game.chains[game.reviewCursor.chainIndex];
    if (!chain) return;

    const entry = chain.entries[game.reviewCursor.entryIndex];
    if (!entry) return;

    const originPlayer = game.players.find(
      (p) => p.orderIndex === chain.originPlayerIndex
    );

    const payload: ReviewEntryPayload = {
      chainIndex: game.reviewCursor.chainIndex,
      totalChains: game.chains.length,
      chainOriginPlayerDisplayName: originPlayer?.displayName ?? "Unknown",
      entryIndex: game.reviewCursor.entryIndex,
      totalEntries: chain.entries.length,
      entry: {
        type: entry.type,
        playerDisplayName: entry.playerDisplayName,
        content: entry.content,
        wasAutoSubmitted: entry.wasAutoSubmitted,
      },
      isLastEntryInChain:
        game.reviewCursor.entryIndex === chain.entries.length - 1,
      isLastChain:
        game.reviewCursor.chainIndex === game.chains.length - 1,
    };

    this.io.to(game.code).emit("review:entry", payload);
  }

  // --------------- Play again ---------------

  handlePlayAgain(game: Game, player: Player): { newGame: Game } {
    if (!player.isHost) {
      throw new GameError("NOT_HOST", "Only the host can start a new game.", 403);
    }
    if (game.state !== "ENDED") {
      throw new GameError("INVALID_STATE", "Game has not ended yet.", 409);
    }

    const connectedPlayers = game.players.filter((p) => p.isConnected);
    if (connectedPlayers.length === 0) {
      throw new GameError("NOT_ENOUGH_PLAYERS", "No connected players.", 409);
    }

    // Create new game
    const newGameId = uuidv4();
    const newCode = generateUniqueGameCode((c) => this.store.isCodeInUse(c));

    const newPlayers: Player[] = connectedPlayers.map((p, i) => ({
      id: uuidv4(),
      displayName: p.displayName,
      isHost: p.id === game.hostPlayerId,
      isConnected: true,
      reconnectionToken: generateReconnectionToken(),
      joinOrder: i,
      orderIndex: null,
      socketId: p.socketId,
    }));

    // Ensure there's exactly one host
    if (!newPlayers.some((p) => p.isHost) && newPlayers.length > 0) {
      newPlayers[0].isHost = true;
    }

    const newGame: Game = {
      id: newGameId,
      code: newCode,
      state: "LOBBY",
      hostPlayerId: newPlayers.find((p) => p.isHost)!.id,
      settings: { ...game.settings },
      players: newPlayers,
      chains: [],
      currentRound: 0,
      totalRounds: 0,
      roundStartedAt: null,
      roundEndsAt: null,
      submittedPlayerIds: new Set(),
      reviewCursor: null,
      createdAt: Date.now(),
      endedAt: null,
    };

    this.store.create(newGame);

    // Move sockets from old room to new room
    if (this.io) {
      for (let i = 0; i < connectedPlayers.length; i++) {
        const oldPlayer = connectedPlayers[i];
        const newPlayer = newPlayers[i];

        if (oldPlayer.socketId) {
          const socket = this.io.sockets.sockets.get(oldPlayer.socketId);
          if (socket) {
            socket.leave(game.code);
            socket.join(newGame.code);

            // Update socket data
            socket.data.gameCode = newGame.code;
            socket.data.playerId = newPlayer.id;
            socket.data.gameId = newGame.id;

            // Send full state to each player individually (with their new credentials)
            socket.emit("game:state", {
              ...this.buildGameStatePayload(newGame, newPlayer),
              newPlayerId: newPlayer.id,
              newReconnectionToken: newPlayer.reconnectionToken,
            });
          }
        }
      }
    }

    return { newGame };
  }

  // --------------- Host transfer ---------------

  private transferHost(game: Game, reason: "left" | "disconnected" | "timeout"): void {
    const currentHost = game.players.find((p) => p.isHost);
    if (!currentHost) return;

    currentHost.isHost = false;

    // Find next connected player by join order
    const candidates = game.players
      .filter((p) => p.isConnected && p.id !== currentHost.id)
      .sort((a, b) => a.joinOrder - b.joinOrder);

    if (candidates.length === 0) {
      // No connected players. Game will be cleaned up by the empty-game timer.
      return;
    }

    const newHost = candidates[0];
    newHost.isHost = true;
    game.hostPlayerId = newHost.id;

    if (this.io) {
      this.io.to(game.code).emit("game:host-changed", {
        previousHostId: currentHost.id,
        previousHostDisplayName: currentHost.displayName,
        newHostId: newHost.id,
        newHostDisplayName: newHost.displayName,
        reason,
      });
    }
  }

  // --------------- State payload builders ---------------

  buildGameStatePayload(game: Game, forPlayer: Player): GameStatePayload {
    const payload: GameStatePayload = {
      gameCode: game.code,
      gameId: game.id,
      state: game.state,
      hostPlayerId: game.hostPlayerId,
      settings: game.settings,
      players: game.players.map(toPlayerPublic),
      currentRound: ["LOBBY", "ENDED"].includes(game.state) ? null : game.currentRound,
      totalRounds: ["LOBBY", "ENDED"].includes(game.state) ? null : game.totalRounds,
    };

    // Add round data for active rounds
    if (
      ["PROMPT", "DRAWING", "GUESSING"].includes(game.state) &&
      game.roundStartedAt &&
      game.roundEndsAt
    ) {
      const roundType = getRoundType(game.currentRound);
      const input = forPlayer.orderIndex !== null
        ? getInputForPlayer(game, forPlayer.orderIndex, game.currentRound)
        : {};

      payload.roundData = {
        type: roundType,
        timerStartedAt: new Date(game.roundStartedAt).toISOString(),
        timerDurationMs: game.roundEndsAt - game.roundStartedAt,
        submittedPlayerIds: Array.from(game.submittedPlayerIds),
        hasSubmitted: game.submittedPlayerIds.has(forPlayer.id),
        ...(input.prompt !== undefined && { prompt: input.prompt }),
        ...(input.drawing !== undefined && { drawing: input.drawing }),
      };
    }

    // Add review data
    if (game.state === "REVIEW" && game.reviewCursor) {
      const chain = game.chains[game.reviewCursor.chainIndex];
      const originPlayer = game.players.find(
        (p) => p.orderIndex === chain?.originPlayerIndex
      );

      const revealedEntries = chain
        ? chain.entries.slice(0, game.reviewCursor.entryIndex + 1).map((e) => ({
            type: e.type,
            playerDisplayName: e.playerDisplayName,
            content: e.content,
            wasAutoSubmitted: e.wasAutoSubmitted,
          }))
        : [];

      payload.reviewData = {
        currentChainIndex: game.reviewCursor.chainIndex,
        totalChains: game.chains.length,
        chainOriginPlayerDisplayName: originPlayer?.displayName ?? "Unknown",
        revealedEntries,
      };
    }

    return payload;
  }

  // --------------- Results ---------------

  getResults(game: Game) {
    const players = game.players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
    }));

    const chains = game.chains.map((chain) => {
      const originPlayer = game.players.find(
        (p) => p.orderIndex === chain.originPlayerIndex
      );
      return {
        originPlayerDisplayName: originPlayer?.displayName ?? "Unknown",
        entries: chain.entries.map((e) => ({
          type: e.type,
          playerDisplayName: e.playerDisplayName,
          content: e.content,
          wasAutoSubmitted: e.wasAutoSubmitted,
        })),
      };
    });

    return {
      gameCode: game.code,
      completedAt: game.endedAt
        ? new Date(game.endedAt).toISOString()
        : new Date().toISOString(),
      players,
      chains,
    };
  }
}

// --------------- Error class ---------------

export class GameError extends Error {
  code: string;
  httpStatus: number;
  details?: unknown;

  constructor(code: string, message: string, httpStatus: number = 400, details?: unknown) {
    super(message);
    this.name = "GameError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
