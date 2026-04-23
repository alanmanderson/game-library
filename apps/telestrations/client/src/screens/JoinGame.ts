/**
 * Join Game screen - code and name input.
 */

import { navigateTo, showToast } from '../app';
import { joinGame, getErrorMessage } from '../api';
import { setState, saveSession } from '../state';
import { connectSocket } from '../socket';

const BACK_ICON = `<svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;

export function renderJoinGame(prefillCode?: string): string {
  return `
    <div class="screen active" id="screen-join">
      <div class="screen-content">
        <div style="padding-top:var(--sp-8);">
          <button class="btn btn-ghost btn-sm" data-action="back" style="margin-bottom:var(--sp-6);">
            <span class="icon">${BACK_ICON}</span>
            Back
          </button>

          <h1 style="margin-bottom:var(--sp-2);">Join Game</h1>
          <p class="text-muted" style="margin-bottom:var(--sp-8);">Enter the code from your friend to join their game.</p>

          <div class="card section-gap">
            <div class="form-group">
              <label class="form-label" for="join-code">Game Code</label>
              <input type="text" id="join-code" class="form-input" placeholder="e.g. FROG" maxlength="4" autocomplete="off" autocapitalize="characters" value="${prefillCode || ''}" style="text-transform:uppercase;letter-spacing:0.08em;font-weight:600;font-size:1.25rem;text-align:center;">
              <p class="form-hint">4 letters, provided by the game host</p>
            </div>

            <div class="form-group">
              <label class="form-label" for="join-name">Your Name</label>
              <input type="text" id="join-name" class="form-input" placeholder="Enter your display name" maxlength="16" autocomplete="off">
              <p class="form-hint">2-16 characters</p>
            </div>

            <div id="join-error" style="display:none;" class="section-gap-sm"></div>

            <button class="btn btn-primary btn-full" data-action="submit-join" id="join-submit-btn">Join Game</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function setupJoinGame(container: HTMLElement): void {
  const codeInput = container.querySelector('#join-code') as HTMLInputElement;
  const nameInput = container.querySelector('#join-name') as HTMLInputElement;
  const errorDiv = container.querySelector('#join-error') as HTMLElement;
  const submitBtn = container.querySelector('#join-submit-btn') as HTMLButtonElement;

  // Auto-uppercase
  codeInput?.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
  });

  // Name validation: alphanumeric + spaces
  nameInput?.addEventListener('input', () => {
    nameInput.value = nameInput.value.replace(/[^a-zA-Z0-9 ]/g, '');
  });

  container.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    const action = target.dataset.action;

    if (action === 'back') {
      navigateTo('landing');
      return;
    }

    if (action === 'submit-join') {
      await handleJoin(codeInput, nameInput, errorDiv, submitBtn);
    }
  });

  // Enter key submits
  const handleEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJoin(codeInput, nameInput, errorDiv, submitBtn);
    }
  };
  codeInput?.addEventListener('keydown', handleEnter);
  nameInput?.addEventListener('keydown', handleEnter);

  // Focus code input on mount
  setTimeout(() => codeInput?.focus(), 100);
}

async function handleJoin(
  codeInput: HTMLInputElement,
  nameInput: HTMLInputElement,
  errorDiv: HTMLElement,
  submitBtn: HTMLButtonElement
): Promise<void> {
  const code = codeInput.value.trim().toUpperCase();
  const name = nameInput.value.trim();

  // Client-side validation
  if (code.length !== 4 || !/^[A-Z]{4}$/.test(code)) {
    showError(errorDiv, codeInput, 'Game code must be exactly 4 letters.');
    return;
  }

  if (name.length < 2) {
    showError(errorDiv, nameInput, 'Display name must be at least 2 characters.');
    return;
  }

  if (name.length > 16) {
    showError(errorDiv, nameInput, 'Display name must be at most 16 characters.');
    return;
  }

  // Disable button
  submitBtn.disabled = true;
  submitBtn.textContent = 'Joining...';

  try {
    const response = await joinGame(code, name);

    // Save session
    setState({
      gameCode: response.gameCode,
      gameId: response.gameId,
      playerId: response.playerId,
      displayName: name,
      reconnectionToken: response.reconnectionToken,
      hostPlayerId: response.players.find((p) => p.isHost)?.id || null,
      players: response.players,
      settings: response.settings,
      gameState: 'LOBBY',
      error: null,
    });
    saveSession();

    // Connect socket
    connectSocket(response.gameCode, response.playerId, response.reconnectionToken);

    // Navigate to lobby
    navigateTo('lobby');
  } catch (err) {
    const msg = getErrorMessage(err);
    showError(errorDiv, codeInput, msg);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Join Game';
  }
}

function showError(errorDiv: HTMLElement, input: HTMLInputElement, message: string): void {
  errorDiv.style.display = 'block';
  errorDiv.innerHTML = `
    <div class="card error-card">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  input.classList.add('error');
  input.focus();

  // Remove error styling on next input
  const handler = () => {
    input.classList.remove('error');
    errorDiv.style.display = 'none';
    input.removeEventListener('input', handler);
  };
  input.addEventListener('input', handler);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
