import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GameManager, GameError } from "../game/GameManager.js";
import { GameStore } from "../game/GameStore.js";
import { TimerService } from "../game/TimerService.js";
import type { Game, Player } from "../models/types.js";

describe("GameManager", () => {
  let store: GameStore;
  let timers: TimerService;
  let gm: GameManager;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new GameStore();
    timers = new TimerService();
    gm = new GameManager(store, timers);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createGameWithPlayers(count: number): {
    game: Game;
    host: Player;
    players: Player[];
  } {
    const { game, hostPlayer } = gm.createGame("Host");
    const allPlayers = [hostPlayer];

    // Manually connect the host
    hostPlayer.isConnected = true;

    for (let i = 1; i < count; i++) {
      const { player } = gm.joinGame(game.code, `Player${i}`);
      player.isConnected = true;
      allPlayers.push(player);
    }

    return { game, host: hostPlayer, players: allPlayers };
  }

  // --------------- Game creation ---------------

  describe("createGame", () => {
    it("creates a game in LOBBY state", () => {
      const { game } = gm.createGame("Alice");
      expect(game.state).toBe("LOBBY");
    });

    it("assigns a 4-letter code", () => {
      const { game } = gm.createGame("Alice");
      expect(game.code).toHaveLength(4);
    });

    it("creates the host player with isHost=true", () => {
      const { hostPlayer } = gm.createGame("Alice");
      expect(hostPlayer.isHost).toBe(true);
    });

    it("host is initially disconnected (awaiting socket)", () => {
      const { hostPlayer } = gm.createGame("Alice");
      expect(hostPlayer.isConnected).toBe(false);
    });

    it("game is retrievable from store by code", () => {
      const { game } = gm.createGame("Alice");
      expect(store.getByCode(game.code)).toBe(game);
    });

    it("applies default settings when none provided", () => {
      const { game } = gm.createGame("Alice");
      expect(game.settings.drawingTimerSeconds).toBe(60);
      expect(game.settings.guessingTimerSeconds).toBe(30);
      expect(game.settings.promptTimerSeconds).toBe(30);
      expect(game.settings.useAllRounds).toBe(true);
    });

    it("applies custom settings when provided", () => {
      const { game } = gm.createGame("Alice", {
        drawingTimerSeconds: 90,
        guessingTimerSeconds: 45,
      });
      expect(game.settings.drawingTimerSeconds).toBe(90);
      expect(game.settings.guessingTimerSeconds).toBe(45);
    });

    it("sanitizes the host display name", () => {
      const { hostPlayer } = gm.createGame("<script>alert(1)</script>");
      expect(hostPlayer.displayName).not.toContain("<script>");
      expect(hostPlayer.displayName).toContain("&lt;script&gt;");
    });
  });

  // --------------- Joining ---------------

  describe("joinGame", () => {
    it("adds a player to the game", () => {
      const { game } = gm.createGame("Alice");
      const { player } = gm.joinGame(game.code, "Bob");
      expect(game.players).toHaveLength(2);
      expect(player.displayName).toBe("Bob");
      expect(player.isHost).toBe(false);
    });

    it("is case-insensitive on game code", () => {
      const { game } = gm.createGame("Alice");
      const code = game.code.toLowerCase();
      const { player } = gm.joinGame(code, "Bob");
      expect(player).toBeDefined();
    });

    it("rejects duplicate display names (case-insensitive)", () => {
      const { game } = gm.createGame("Alice");
      expect(() => gm.joinGame(game.code, "alice")).toThrow(GameError);
      try {
        gm.joinGame(game.code, "ALICE");
      } catch (e: any) {
        expect(e.code).toBe("DISPLAY_NAME_TAKEN");
      }
    });

    it("rejects joining a non-existent game", () => {
      try {
        gm.joinGame("ZZZZ", "Bob");
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.code).toBe("GAME_NOT_FOUND");
        expect(e.httpStatus).toBe(404);
      }
    });

    it("rejects joining a started game", () => {
      const { game, host } = createGameWithPlayers(4);
      gm.startGame(game, host);
      try {
        gm.joinGame(game.code, "LateJoiner");
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.code).toBe("GAME_ALREADY_STARTED");
      }
    });

    it("rejects joining a full game (20 players)", () => {
      const { game } = gm.createGame("Host");
      game.players[0].isConnected = true;
      for (let i = 1; i < 20; i++) {
        const { player } = gm.joinGame(game.code, `P${i}`);
        player.isConnected = true;
      }
      expect(game.players).toHaveLength(20);
      try {
        gm.joinGame(game.code, "TooMany");
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.code).toBe("GAME_FULL");
      }
    });
  });

  // --------------- Start game ---------------

  describe("startGame", () => {
    it("transitions from LOBBY to PROMPT", () => {
      const { game, host } = createGameWithPlayers(4);
      gm.startGame(game, host);
      expect(game.state).toBe("PROMPT");
    });

    it("assigns orderIndex to all players", () => {
      const { game, host } = createGameWithPlayers(4);
      gm.startGame(game, host);
      game.players.forEach((p, i) => {
        expect(p.orderIndex).toBe(i);
      });
    });

    it("initializes chains (one per player)", () => {
      const { game, host } = createGameWithPlayers(5);
      gm.startGame(game, host);
      expect(game.chains).toHaveLength(5);
    });

    it("sets totalRounds = players when useAllRounds", () => {
      const { game, host } = createGameWithPlayers(6);
      gm.startGame(game, host);
      // totalRounds = roundCount + 1 = (6-1) + 1 = 6
      expect(game.totalRounds).toBe(6);
    });

    it("clamps customRoundCount to players - 1", () => {
      const { game, host } = createGameWithPlayers(4);
      game.settings.useAllRounds = false;
      game.settings.customRoundCount = 10; // more than 3 (players - 1)
      gm.startGame(game, host);
      expect(game.totalRounds).toBe(4); // clamped to 3 + 1
    });

    it("rejects start with < 4 connected players", () => {
      const { game, host } = createGameWithPlayers(4);
      game.players[1].isConnected = false;
      expect(() => gm.startGame(game, host)).toThrow(GameError);
      try {
        gm.startGame(game, host);
      } catch (e: any) {
        expect(e.code).toBe("NOT_ENOUGH_PLAYERS");
      }
    });

    it("rejects start by non-host", () => {
      const { game, players } = createGameWithPlayers(4);
      expect(() => gm.startGame(game, players[1])).toThrow(GameError);
      try {
        gm.startGame(game, players[1]);
      } catch (e: any) {
        expect(e.code).toBe("NOT_HOST");
      }
    });

    it("rejects start if game is not in LOBBY", () => {
      const { game, host } = createGameWithPlayers(4);
      gm.startGame(game, host);
      expect(() => gm.startGame(game, host)).toThrow(GameError);
    });
  });

  // --------------- Submissions ---------------

  describe("handleSubmission", () => {
    it("accepts a prompt submission", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      gm.handleSubmission(game, players[0], "elephant");
      expect(game.submittedPlayerIds.has(players[0].id)).toBe(true);
    });

    it("rejects duplicate submission from same player", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      gm.handleSubmission(game, players[0], "elephant");
      expect(() => gm.handleSubmission(game, players[0], "giraffe")).toThrow(GameError);
    });

    it("rejects submission when game is in wrong state", () => {
      const { game, host, players } = createGameWithPlayers(4);
      expect(() =>
        gm.handleSubmission(game, players[0], "test")
      ).toThrow(GameError);
    });

    it("auto-assigns random word for empty prompt", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      gm.handleSubmission(game, players[0], "   "); // whitespace only
      const chain = game.chains[0];
      expect(chain.entries[0].content.length).toBeGreaterThan(0);
      expect(chain.entries[0].content).not.toBe("???");
    });

    it("sanitizes text content", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      gm.handleSubmission(game, players[0], "<b>bold</b>");
      const entry = game.chains[0].entries[0];
      expect(entry.content).not.toContain("<b>");
      expect(entry.content).toContain("&lt;b&gt;");
    });

    it("truncates content exceeding max length", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      const longContent = "x".repeat(200);
      gm.handleSubmission(game, players[0], longContent);
      const entry = game.chains[0].entries[0];
      expect(entry.content.length).toBeLessThanOrEqual(80);
    });

    it("rejects submission after timer expired (with grace period)", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      // Advance past timer + grace period
      game.roundEndsAt = Date.now() - 3000; // 3 seconds ago, grace is 2s
      expect(() => gm.handleSubmission(game, players[0], "late")).toThrow(GameError);
    });

    it("all players submitting triggers round end", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      for (const p of players) {
        gm.handleSubmission(game, p, `prompt-${p.id}`);
      }

      // After all submit, a transition timer starts. After it fires, state changes.
      // At this point the round just ended. The transition timer is pending.
      // The submittedPlayerIds should be full.
      expect(game.submittedPlayerIds.size).toBe(4);
    });
  });

  // --------------- Round transitions with fake timers ---------------

  describe("round transitions", () => {
    it("transitions PROMPT -> DRAWING after all submit and transition timer", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      for (const p of players) {
        gm.handleSubmission(game, p, `prompt-${p.id}`);
      }

      // Advance past the 3-second transition timer
      vi.advanceTimersByTime(3100);

      expect(game.state).toBe("DRAWING");
      expect(game.currentRound).toBe(1);
    });

    it("transitions through full game: PROMPT -> DRAW -> GUESS -> ... -> REVIEW", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      // totalRounds = 4 (rounds 0,1,2,3)
      // Round 0: PROMPT
      for (const p of players) {
        gm.handleSubmission(game, p, `prompt-${p.id}`);
      }
      vi.advanceTimersByTime(3100);
      expect(game.state).toBe("DRAWING");
      expect(game.currentRound).toBe(1);

      // Round 1: DRAWING
      for (const p of players) {
        gm.handleSubmission(
          game,
          p,
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        );
      }
      vi.advanceTimersByTime(3100);
      expect(game.state).toBe("GUESSING");
      expect(game.currentRound).toBe(2);

      // Round 2: GUESSING
      for (const p of players) {
        gm.handleSubmission(game, p, `guess-${p.id}`);
      }
      vi.advanceTimersByTime(3100);
      expect(game.state).toBe("DRAWING");
      expect(game.currentRound).toBe(3);

      // Round 3: DRAWING (final round)
      for (const p of players) {
        gm.handleSubmission(
          game,
          p,
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        );
      }
      vi.advanceTimersByTime(3100);
      expect(game.state).toBe("REVIEW");
    });
  });

  // --------------- Timer expiry ---------------

  describe("timer expiry / auto-submit", () => {
    it("auto-submits for all players when round timer expires", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      // Nobody submits. The timer is promptTimerSeconds(30s) + gracePeriod(2s) = 32s.
      vi.advanceTimersByTime(33000);

      // All players should be auto-submitted
      expect(game.submittedPlayerIds.size).toBe(4);

      // After transition timer (another 3s), we move to DRAWING
      vi.advanceTimersByTime(3100);
      expect(game.state).toBe("DRAWING");
    });
  });

  // --------------- End early ---------------

  describe("handleEndEarly", () => {
    it("host can end round early when at most 1 player has not submitted", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      // 3 players submit
      gm.handleSubmission(game, players[0], "test1");
      gm.handleSubmission(game, players[1], "test2");
      gm.handleSubmission(game, players[2], "test3");

      gm.handleEndEarly(game, host);
      expect(game.submittedPlayerIds.size).toBe(4);
    });

    it("non-host cannot end early", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      gm.handleSubmission(game, players[0], "test1");
      gm.handleSubmission(game, players[1], "test2");
      gm.handleSubmission(game, players[2], "test3");

      expect(() => gm.handleEndEarly(game, players[1])).toThrow(GameError);
    });

    it("rejects end early when more than 1 player has not submitted", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      gm.handleSubmission(game, players[0], "test1");
      // 3 have not submitted

      expect(() => gm.handleEndEarly(game, host)).toThrow(GameError);
      try {
        gm.handleEndEarly(game, host);
      } catch (e: any) {
        expect(e.code).toBe("CANNOT_END_EARLY");
      }
    });
  });

  // --------------- Review ---------------

  describe("review navigation", () => {
    function setupGameInReview() {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      // Fast-forward through all rounds
      for (let round = 0; round < game.totalRounds; round++) {
        for (const p of players) {
          const roundType = game.state;
          if (roundType === "DRAWING") {
            gm.handleSubmission(
              game,
              p,
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
            );
          } else {
            gm.handleSubmission(game, p, `content-r${round}-${p.id}`);
          }
        }
        vi.advanceTimersByTime(3100);
      }

      expect(game.state).toBe("REVIEW");
      return { game, host, players };
    }

    it("starts review at chain 0, entry 0", () => {
      const { game } = setupGameInReview();
      expect(game.reviewCursor).toEqual({ chainIndex: 0, entryIndex: 0 });
    });

    // -- handleReviewNextEntry --

    it("handleReviewNextEntry advances entry index within chain", () => {
      const { game, host } = setupGameInReview();
      gm.handleReviewNextEntry(game, host);
      expect(game.reviewCursor!.entryIndex).toBe(1);
      expect(game.reviewCursor!.chainIndex).toBe(0);
    });

    it("handleReviewNextEntry at last entry of chain is a no-op", () => {
      const { game, host } = setupGameInReview();
      const entriesInChain0 = game.chains[0].entries.length;
      // Advance to last entry
      for (let i = 0; i < entriesInChain0 - 1; i++) {
        gm.handleReviewNextEntry(game, host);
      }
      expect(game.reviewCursor!.entryIndex).toBe(entriesInChain0 - 1);
      expect(game.reviewCursor!.chainIndex).toBe(0);

      // One more should be a no-op
      gm.handleReviewNextEntry(game, host);
      expect(game.reviewCursor!.entryIndex).toBe(entriesInChain0 - 1);
      expect(game.reviewCursor!.chainIndex).toBe(0);
    });

    // -- handleReviewPrevEntry --

    it("handleReviewPrevEntry decrements entry index within chain", () => {
      const { game, host } = setupGameInReview();
      gm.handleReviewNextEntry(game, host);
      gm.handleReviewNextEntry(game, host);
      expect(game.reviewCursor!.entryIndex).toBe(2);

      gm.handleReviewPrevEntry(game, host);
      expect(game.reviewCursor!.entryIndex).toBe(1);
      expect(game.reviewCursor!.chainIndex).toBe(0);
    });

    it("handleReviewPrevEntry at entry 0 is a no-op", () => {
      const { game, host } = setupGameInReview();
      gm.handleReviewPrevEntry(game, host);
      expect(game.reviewCursor).toEqual({ chainIndex: 0, entryIndex: 0 });
    });

    // -- handleReviewNextChain --

    it("handleReviewNextChain jumps to next chain at entry 0", () => {
      const { game, host } = setupGameInReview();
      // Advance a few entries first
      gm.handleReviewNextEntry(game, host);
      gm.handleReviewNextEntry(game, host);
      expect(game.reviewCursor!.entryIndex).toBe(2);

      gm.handleReviewNextChain(game, host);
      expect(game.reviewCursor!.chainIndex).toBe(1);
      expect(game.reviewCursor!.entryIndex).toBe(0);
    });

    it("handleReviewNextChain on last chain ends the game", () => {
      const { game, host } = setupGameInReview();
      // Jump to last chain
      for (let c = 0; c < game.chains.length - 1; c++) {
        gm.handleReviewNextChain(game, host);
      }
      expect(game.reviewCursor!.chainIndex).toBe(game.chains.length - 1);

      // Next chain from last chain ends game
      gm.handleReviewNextChain(game, host);
      expect(game.state).toBe("ENDED");
    });

    // -- handleReviewPrevChain --

    it("handleReviewPrevChain jumps to previous chain at entry 0", () => {
      const { game, host } = setupGameInReview();
      gm.handleReviewNextChain(game, host);
      // Advance some entries
      gm.handleReviewNextEntry(game, host);
      expect(game.reviewCursor!.chainIndex).toBe(1);
      expect(game.reviewCursor!.entryIndex).toBe(1);

      gm.handleReviewPrevChain(game, host);
      expect(game.reviewCursor!.chainIndex).toBe(0);
      expect(game.reviewCursor!.entryIndex).toBe(0);
    });

    it("handleReviewPrevChain at chain 0 is a no-op", () => {
      const { game, host } = setupGameInReview();
      gm.handleReviewPrevChain(game, host);
      expect(game.reviewCursor).toEqual({ chainIndex: 0, entryIndex: 0 });
    });

    // -- Authorization checks --

    it("non-host cannot navigate review (entry-level)", () => {
      const { game, players } = setupGameInReview();
      expect(() => gm.handleReviewNextEntry(game, players[1])).toThrow(GameError);
      expect(() => gm.handleReviewPrevEntry(game, players[1])).toThrow(GameError);
    });

    it("non-host cannot navigate review (chain-level)", () => {
      const { game, players } = setupGameInReview();
      expect(() => gm.handleReviewNextChain(game, players[1])).toThrow(GameError);
      expect(() => gm.handleReviewPrevChain(game, players[1])).toThrow(GameError);
    });

    // -- Legacy methods still work --

    it("handleReviewNext advances entry then crosses chain boundary", () => {
      const { game, host } = setupGameInReview();
      const entriesInChain0 = game.chains[0].entries.length;
      // Advance to end of chain 0
      for (let i = 0; i < entriesInChain0 - 1; i++) {
        gm.handleReviewNext(game, host);
      }
      expect(game.reviewCursor!.chainIndex).toBe(0);
      expect(game.reviewCursor!.entryIndex).toBe(entriesInChain0 - 1);

      // Next should go to chain 1, entry 0
      gm.handleReviewNext(game, host);
      expect(game.reviewCursor!.chainIndex).toBe(1);
      expect(game.reviewCursor!.entryIndex).toBe(0);
    });

    it("handleReviewNext on last entry of last chain ends game", () => {
      const { game, host } = setupGameInReview();
      // Navigate to the very end
      for (let c = 0; c < game.chains.length; c++) {
        for (let e = 0; e < game.chains[c].entries.length; e++) {
          if (c === 0 && e === 0) continue; // already at 0,0
          gm.handleReviewNext(game, host);
        }
      }
      // Now at the last entry of the last chain
      gm.handleReviewNext(game, host);
      expect(game.state).toBe("ENDED");
    });

    it("handleReviewPrevious at very beginning is a no-op", () => {
      const { game, host } = setupGameInReview();
      gm.handleReviewPrevious(game, host);
      expect(game.reviewCursor).toEqual({ chainIndex: 0, entryIndex: 0 });
    });
  });

  // --------------- Kick ---------------

  describe("handleKick", () => {
    it("removes a player from the lobby", () => {
      const { game, host, players } = createGameWithPlayers(5);
      gm.handleKick(game, host, players[2].id);
      expect(game.players.find((p) => p.id === players[2].id)).toBeUndefined();
      expect(game.players).toHaveLength(4);
    });

    it("non-host cannot kick", () => {
      const { game, players } = createGameWithPlayers(5);
      expect(() =>
        gm.handleKick(game, players[1], players[2].id)
      ).toThrow(GameError);
    });

    it("cannot kick the host", () => {
      const { game, host } = createGameWithPlayers(5);
      try {
        gm.handleKick(game, host, host.id);
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.code).toBe("CANNOT_KICK_HOST");
      }
    });

    it("cannot kick in non-LOBBY state", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);
      expect(() =>
        gm.handleKick(game, host, players[1].id)
      ).toThrow(GameError);
    });

    it("throws for non-existent player", () => {
      const { game, host } = createGameWithPlayers(4);
      try {
        gm.handleKick(game, host, "nonexistent");
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.code).toBe("PLAYER_NOT_FOUND");
      }
    });
  });

  // --------------- Host transfer ---------------

  describe("host transfer on player leave", () => {
    it("transfers host to next player by join order when host leaves lobby", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.handlePlayerLeave(game, host);

      const newHost = game.players.find((p) => p.isHost);
      expect(newHost).toBeDefined();
      expect(newHost!.id).toBe(players[1].id);
      expect(game.hostPlayerId).toBe(players[1].id);
    });
  });

  // --------------- Settings ---------------

  describe("handleSettingsUpdate", () => {
    it("host can update settings in lobby", () => {
      const { game, host } = createGameWithPlayers(4);
      gm.handleSettingsUpdate(game, host, { drawingTimerSeconds: 90 });
      expect(game.settings.drawingTimerSeconds).toBe(90);
    });

    it("non-host cannot update settings", () => {
      const { game, players } = createGameWithPlayers(4);
      expect(() =>
        gm.handleSettingsUpdate(game, players[1], { drawingTimerSeconds: 90 })
      ).toThrow(GameError);
    });

    it("cannot update settings after game started", () => {
      const { game, host } = createGameWithPlayers(4);
      gm.startGame(game, host);
      expect(() =>
        gm.handleSettingsUpdate(game, host, { drawingTimerSeconds: 90 })
      ).toThrow(GameError);
    });
  });

  // --------------- Play again ---------------

  describe("handlePlayAgain", () => {
    function setupEndedGame() {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      // Fast-forward through all rounds
      for (let round = 0; round < game.totalRounds; round++) {
        for (const p of players) {
          if (game.state === "DRAWING") {
            gm.handleSubmission(
              game,
              p,
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
            );
          } else {
            gm.handleSubmission(game, p, `content-r${round}-${p.id}`);
          }
        }
        vi.advanceTimersByTime(3100);
      }

      // Navigate through all chains to reach ENDED
      while (game.state === "REVIEW") {
        gm.handleReviewNextChain(game, host);
      }

      expect(game.state).toBe("ENDED");
      return { game, host, players };
    }

    it("creates a new game in LOBBY", () => {
      const { game, host } = setupEndedGame();
      const { newGame } = gm.handlePlayAgain(game, host);
      expect(newGame.state).toBe("LOBBY");
      expect(newGame.code).not.toBe(game.code);
    });

    it("copies connected players to new game with same display names", () => {
      const { game, host, players } = setupEndedGame();
      const { newGame } = gm.handlePlayAgain(game, host);

      const oldNames = players.map((p) => p.displayName).sort();
      const newNames = newGame.players.map((p) => p.displayName).sort();
      expect(newNames).toEqual(oldNames);
    });

    it("new game has new player IDs", () => {
      const { game, host, players } = setupEndedGame();
      const oldIds = players.map((p) => p.id).sort();
      const { newGame } = gm.handlePlayAgain(game, host);
      const newIds = newGame.players.map((p) => p.id).sort();
      expect(newIds).not.toEqual(oldIds);
    });

    it("non-host cannot play again", () => {
      const { game, players } = setupEndedGame();
      expect(() => gm.handlePlayAgain(game, players[1])).toThrow(GameError);
    });

    it("rejects play again if game is not ENDED", () => {
      const { game, host } = createGameWithPlayers(4);
      expect(() => gm.handlePlayAgain(game, host)).toThrow(GameError);
    });
  });

  // --------------- Results ---------------

  describe("getResults", () => {
    it("returns structured results with chains", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      // Complete all rounds
      for (let round = 0; round < game.totalRounds; round++) {
        for (const p of players) {
          if (game.state === "DRAWING") {
            gm.handleSubmission(
              game,
              p,
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
            );
          } else {
            gm.handleSubmission(game, p, `content-r${round}-${p.id}`);
          }
        }
        vi.advanceTimersByTime(3100);
      }

      const results = gm.getResults(game);
      expect(results.gameCode).toBe(game.code);
      expect(results.chains).toHaveLength(4);
      expect(results.players).toHaveLength(4);
      expect(results.chains[0].entries.length).toBeGreaterThan(0);
    });
  });

  // --------------- buildGameStatePayload ---------------

  describe("buildGameStatePayload", () => {
    it("includes round data during active round", () => {
      const { game, host, players } = createGameWithPlayers(4);
      gm.startGame(game, host);

      const payload = gm.buildGameStatePayload(game, players[0]);
      expect(payload.state).toBe("PROMPT");
      expect(payload.roundData).toBeDefined();
      expect(payload.roundData!.type).toBe("PROMPT");
    });

    it("does not include roundData in LOBBY", () => {
      const { game, host } = createGameWithPlayers(4);
      const payload = gm.buildGameStatePayload(game, host);
      expect(payload.roundData).toBeUndefined();
      expect(payload.currentRound).toBeNull();
      expect(payload.totalRounds).toBeNull();
    });
  });
});
