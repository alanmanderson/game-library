/**
 * Server-authoritative timer management.
 *
 * Every setTimeout is tracked by gameId so we can clean them all up
 * when a game is deleted. This prevents the classic game-server memory leak
 * of orphaned timers firing after state is gone.
 */

interface GameTimers {
  roundTimer: ReturnType<typeof setTimeout> | null;
  transitionTimer: ReturnType<typeof setTimeout> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  tickInterval: ReturnType<typeof setInterval> | null;
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>; // playerId -> timer
}

export class TimerService {
  private timers: Map<string, GameTimers> = new Map();

  private ensureGameTimers(gameId: string): GameTimers {
    let gt = this.timers.get(gameId);
    if (!gt) {
      gt = {
        roundTimer: null,
        transitionTimer: null,
        cleanupTimer: null,
        tickInterval: null,
        disconnectTimers: new Map(),
      };
      this.timers.set(gameId, gt);
    }
    return gt;
  }

  startRoundTimer(gameId: string, durationMs: number, onExpire: () => void): void {
    const gt = this.ensureGameTimers(gameId);
    if (gt.roundTimer) {
      clearTimeout(gt.roundTimer);
    }
    gt.roundTimer = setTimeout(onExpire, durationMs);
  }

  clearRoundTimer(gameId: string): void {
    const gt = this.timers.get(gameId);
    if (gt?.roundTimer) {
      clearTimeout(gt.roundTimer);
      gt.roundTimer = null;
    }
  }

  startTickInterval(gameId: string, intervalMs: number, onTick: () => void): void {
    const gt = this.ensureGameTimers(gameId);
    if (gt.tickInterval) {
      clearInterval(gt.tickInterval);
    }
    gt.tickInterval = setInterval(onTick, intervalMs);
  }

  clearTickInterval(gameId: string): void {
    const gt = this.timers.get(gameId);
    if (gt?.tickInterval) {
      clearInterval(gt.tickInterval);
      gt.tickInterval = null;
    }
  }

  startTransitionTimer(gameId: string, durationMs: number, onComplete: () => void): void {
    const gt = this.ensureGameTimers(gameId);
    if (gt.transitionTimer) {
      clearTimeout(gt.transitionTimer);
    }
    gt.transitionTimer = setTimeout(onComplete, durationMs);
  }

  clearTransitionTimer(gameId: string): void {
    const gt = this.timers.get(gameId);
    if (gt?.transitionTimer) {
      clearTimeout(gt.transitionTimer);
      gt.transitionTimer = null;
    }
  }

  startCleanupTimer(gameId: string, durationMs: number, onExpire: () => void): void {
    const gt = this.ensureGameTimers(gameId);
    if (gt.cleanupTimer) {
      clearTimeout(gt.cleanupTimer);
    }
    gt.cleanupTimer = setTimeout(onExpire, durationMs);
  }

  clearCleanupTimer(gameId: string): void {
    const gt = this.timers.get(gameId);
    if (gt?.cleanupTimer) {
      clearTimeout(gt.cleanupTimer);
      gt.cleanupTimer = null;
    }
  }

  startDisconnectTimer(gameId: string, playerId: string, durationMs: number, onExpire: () => void): void {
    const gt = this.ensureGameTimers(gameId);
    const existing = gt.disconnectTimers.get(playerId);
    if (existing) {
      clearTimeout(existing);
    }
    gt.disconnectTimers.set(playerId, setTimeout(onExpire, durationMs));
  }

  clearDisconnectTimer(gameId: string, playerId: string): void {
    const gt = this.timers.get(gameId);
    if (gt) {
      const timer = gt.disconnectTimers.get(playerId);
      if (timer) {
        clearTimeout(timer);
        gt.disconnectTimers.delete(playerId);
      }
    }
  }

  /**
   * Clear ALL timers for a game. Called on game deletion.
   */
  clearAll(gameId: string): void {
    const gt = this.timers.get(gameId);
    if (!gt) return;

    if (gt.roundTimer) clearTimeout(gt.roundTimer);
    if (gt.transitionTimer) clearTimeout(gt.transitionTimer);
    if (gt.cleanupTimer) clearTimeout(gt.cleanupTimer);
    if (gt.tickInterval) clearInterval(gt.tickInterval);

    for (const timer of gt.disconnectTimers.values()) {
      clearTimeout(timer);
    }

    this.timers.delete(gameId);
  }

  /**
   * Returns the number of games with active timers. Used for health check.
   */
  activeGameCount(): number {
    return this.timers.size;
  }
}
