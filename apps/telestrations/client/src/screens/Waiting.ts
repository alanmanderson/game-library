/**
 * Waiting for other players screen.
 * Shows submission status and host end-round-early button.
 */

import { getState, isHost } from '../state';
import { renderTimer, startTimerLoop, stopTimerLoop } from '../components/Timer';
import { renderPlayerList } from '../components/PlayerList';
import { emitEndRoundEarly } from '../socket';

export function renderWaiting(): string {
  const state = getState();
  const amHost = isHost();
  const playerListHtml = renderPlayerList({ showSubmissionStatus: true });
  const submittedCount = state.roundData?.submittedPlayerIds.length ?? 0;
  const totalPlayers = state.players.length;
  const unsubmittedCount = totalPlayers - submittedCount;
  const canEndEarly = amHost && unsubmittedCount <= 1 && unsubmittedCount > 0;

  return `
    <div class="screen active" id="screen-waiting">
      <div class="screen-content">
        <div style="padding-top:var(--sp-6);">
          <div style="text-align:center;margin-bottom:var(--sp-4);">
            ${renderTimer()}
          </div>

          <div class="waiting-state section-gap">
            <div class="waiting-spinner"></div>
            <h2 style="margin-bottom:var(--sp-2);">Waiting for other players...</h2>
            <p class="text-sm text-muted">Your answer has been submitted</p>
          </div>

          <div class="card section-gap">
            <h4 style="margin-bottom:var(--sp-3);">Submissions (${submittedCount}/${totalPlayers})</h4>
            ${playerListHtml}
          </div>

          ${amHost ? `
            <button class="btn btn-secondary btn-full" data-action="end-round-early" ${canEndEarly ? '' : 'disabled'}>
              End Round Early
            </button>
            <p class="text-caption text-muted text-center" style="margin-top:var(--sp-1);">
              ${canEndEarly ? 'Force remaining player to submit' : 'Available when at most 1 player remains'}
            </p>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

export function setupWaiting(container: HTMLElement): void {
  const timerEl = container.querySelector('#game-timer') as HTMLElement;
  if (timerEl) startTimerLoop(timerEl);

  container.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    if (target.dataset.action === 'end-round-early') {
      emitEndRoundEarly();
      (target as HTMLButtonElement).disabled = true;
      target.textContent = 'Ending round...';
    }
  });
}

export function cleanupWaiting(): void {
  stopTimerLoop();
}
