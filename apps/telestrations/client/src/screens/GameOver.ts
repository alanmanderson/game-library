/**
 * Game over screen.
 * Play Again (host), Download Results, Home.
 */

import { getState, isHost, clearSession, setState } from '../state';
import { emitPlayAgain, disconnectSocket } from '../socket';
import { getResults } from '../api';
import { navigateTo, showToast } from '../app';

const REPLAY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`;
const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
const HOME_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
const CELEBRATION_ICON = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/><path d="M12 3v12"/><path d="M5 21h14"/><path d="m15 3 3 3-3 3"/><path d="m9 3-3 3 3 3"/></svg>`;

export function renderGameOver(): string {
  const amHost = isHost();

  return `
    <div class="screen active" id="screen-gameover">
      <div class="screen-content">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:calc(100vh - 80px);">
          <div style="margin-bottom:var(--sp-12);text-align:center;">
            <div class="game-over-icon">
              ${CELEBRATION_ICON}
            </div>
            <h1 class="game-over-header">Game Over!</h1>
            <p class="game-over-sub">Thanks for playing! That was hilarious.</p>
          </div>

          <div style="width:100%;max-width:340px;display:flex;flex-direction:column;gap:var(--sp-3);">
            ${amHost ? `
              <button class="btn btn-primary btn-full btn-lg" data-action="play-again">
                <span class="icon">${REPLAY_ICON}</span>
                Play Again
              </button>
              <p class="text-caption text-muted text-center" style="margin-top:-4px;">Creates a new game with same players</p>
            ` : ''}

            <button class="btn btn-secondary btn-full" data-action="download-results">
              <span class="icon">${DOWNLOAD_ICON}</span>
              Download Results
            </button>

            <button class="btn btn-ghost btn-full" data-action="go-home">
              <span class="icon">${HOME_ICON}</span>
              Home
            </button>
          </div>

          <p class="text-caption text-muted" style="margin-top:var(--sp-8);">Results available for download for 10 minutes</p>
        </div>
      </div>
    </div>
  `;
}

export function setupGameOver(container: HTMLElement): void {
  container.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    const action = target.dataset.action;

    if (action === 'play-again') {
      emitPlayAgain();
      (target as HTMLButtonElement).disabled = true;
      target.textContent = 'Creating new game...';
    }

    if (action === 'download-results') {
      await handleDownloadResults(target as HTMLButtonElement);
    }

    if (action === 'go-home') {
      disconnectSocket();
      clearSession();
      setState({ error: null });
      navigateTo('landing');
    }
  });
}

async function handleDownloadResults(btn: HTMLButtonElement): Promise<void> {
  const state = getState();
  if (!state.gameCode || !state.playerId) return;

  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.textContent = 'Downloading...';

  try {
    const results = await getResults(state.gameCode, state.playerId);

    // Download as JSON (the full results with base64 images)
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telestrations-${state.gameCode}-results.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Results downloaded!');
  } catch (err) {
    showToast('Failed to download results. They may have expired.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}
