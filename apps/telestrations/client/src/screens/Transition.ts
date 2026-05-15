/**
 * Round transition screen - countdown between rounds.
 */

import { getState } from '../state';

const PEN_ICON = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6;"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
const QUESTION_ICON = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6;"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
const REVIEW_ICON = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

let countdownInterval: number | null = null;

export function renderTransition(): string {
  const state = getState();
  const transition = state.transitionData;

  if (!transition) {
    return `
      <div class="screen active" id="screen-transition">
        <div class="screen-content">
          <div class="transition-screen">
            <div class="waiting-spinner"></div>
            <p class="text-muted">Loading...</p>
          </div>
        </div>
      </div>
    `;
  }

  const nextType = transition.nextType;
  let icon = PEN_ICON;
  let message = 'Get ready...';

  if (nextType === 'DRAWING') {
    icon = PEN_ICON;
    message = 'Get ready to draw...';
  } else if (nextType === 'GUESSING') {
    icon = QUESTION_ICON;
    message = 'Get ready to guess...';
  } else if (nextType === 'REVIEW') {
    icon = REVIEW_ICON;
    message = 'Time to see the results!';
  }

  return `
    <div class="screen active" id="screen-transition">
      <div class="screen-content">
        <div class="transition-screen">
          <div>${icon}</div>
          <div>
            <h2 style="margin-bottom:var(--sp-2);color:var(--gray-700);">Round ${transition.roundCompleted + 1} complete!</h2>
            <p class="text-muted" style="font-size:1.125rem;">${message}</p>
          </div>
          <div class="transition-countdown" id="transition-countdown">3</div>
        </div>
      </div>
    </div>
  `;
}

export function setupTransition(container: HTMLElement): void {
  const countdownEl = container.querySelector('#transition-countdown') as HTMLElement;
  if (!countdownEl) return;

  let count = 3;
  countdownEl.textContent = String(count);

  countdownInterval = window.setInterval(() => {
    count--;
    if (count > 0) {
      countdownEl.textContent = String(count);
    } else {
      if (countdownInterval !== null) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }
  }, 1000);
}

export function cleanupTransition(): void {
  if (countdownInterval !== null) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}
