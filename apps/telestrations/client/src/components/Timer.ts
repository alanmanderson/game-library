/**
 * Timer display component.
 * Server-authoritative with local countdown.
 */

import { getState } from '../state';
import { formatTime, getTimerState } from '../utils/time';

const CLOCK_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="timer-icon"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

let timerFrame: number | null = null;

/**
 * Start the timer animation loop, updating the DOM each frame.
 */
export function startTimerLoop(timerEl: HTMLElement): void {
  stopTimerLoop();

  function tick() {
    const state = getState();
    if (!state.roundData) {
      timerEl.className = 'timer';
      timerEl.innerHTML = `${CLOCK_ICON} --:--`;
      return;
    }

    const startTime = new Date(state.roundData.timerStartedAt).getTime();
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, state.roundData.timerDurationMs - elapsed);

    const timerState = getTimerState(remaining);
    timerEl.className = 'timer' +
      (timerState === 'warning' ? ' timer-warning' : '') +
      (timerState === 'critical' ? ' timer-critical' : '');

    timerEl.innerHTML = `${CLOCK_ICON} ${formatTime(remaining)}`;

    // Update aria-live for screen readers at key intervals
    const seconds = Math.ceil(remaining / 1000);
    if (seconds === 30 || seconds === 10 || seconds === 5) {
      timerEl.setAttribute('aria-label', `${seconds} seconds remaining`);
    }

    timerFrame = requestAnimationFrame(tick);
  }

  timerFrame = requestAnimationFrame(tick);
}

export function stopTimerLoop(): void {
  if (timerFrame !== null) {
    cancelAnimationFrame(timerFrame);
    timerFrame = null;
  }
}

/**
 * Get remaining time in milliseconds based on current state.
 */
export function getRemainingMs(): number {
  const state = getState();
  if (!state.roundData) return 0;

  const startTime = new Date(state.roundData.timerStartedAt).getTime();
  const elapsed = Date.now() - startTime;
  return Math.max(0, state.roundData.timerDurationMs - elapsed);
}

/**
 * Render a static timer element.
 */
export function renderTimer(): string {
  return `<div class="timer" aria-live="polite" role="timer" id="game-timer">${CLOCK_ICON} --:--</div>`;
}
