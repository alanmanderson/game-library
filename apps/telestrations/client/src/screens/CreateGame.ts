/**
 * Create Game screen with settings.
 */

import { navigateTo } from '../app';
import { createGame, getErrorMessage } from '../api';
import { setState, saveSession } from '../state';
import { connectSocket } from '../socket';

const BACK_ICON = `<svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`;

export function renderCreateGame(): string {
  return `
    <div class="screen active" id="screen-create">
      <div class="screen-content">
        <div style="padding-top:var(--sp-8);">
          <button class="btn btn-ghost btn-sm" data-action="back" style="margin-bottom:var(--sp-6);">
            <span class="icon">${BACK_ICON}</span>
            Back
          </button>

          <h1 style="margin-bottom:var(--sp-2);">Create Game</h1>
          <p class="text-muted" style="margin-bottom:var(--sp-8);">Set up your game and invite friends to play.</p>

          <div class="card section-gap">
            <div class="form-group">
              <label class="form-label" for="host-name">Your Name</label>
              <input type="text" id="host-name" class="form-input" placeholder="Enter your display name" maxlength="16" autocomplete="off">
            </div>
          </div>

          <div class="card section-gap">
            <h3 style="margin-bottom:var(--sp-4);">Settings</h3>

            <div class="form-group">
              <label class="form-label" for="draw-timer">Drawing Timer</label>
              <select id="draw-timer" class="form-select">
                <option value="30">30 seconds</option>
                <option value="45">45 seconds</option>
                <option value="60" selected>60 seconds</option>
                <option value="90">90 seconds</option>
                <option value="120">120 seconds</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="guess-timer">Guessing Timer</label>
              <select id="guess-timer" class="form-select">
                <option value="15">15 seconds</option>
                <option value="20">20 seconds</option>
                <option value="30" selected>30 seconds</option>
                <option value="45">45 seconds</option>
                <option value="60">60 seconds</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="prompt-timer">Prompt Timer</label>
              <select id="prompt-timer" class="form-select">
                <option value="15">15 seconds</option>
                <option value="20">20 seconds</option>
                <option value="30" selected>30 seconds</option>
                <option value="45">45 seconds</option>
                <option value="60">60 seconds</option>
              </select>
            </div>

            <div style="border-top:1px solid var(--gray-100);padding-top:var(--sp-4);margin-top:var(--sp-2);">
              <div class="toggle-row">
                <div>
                  <div class="form-label" style="margin-bottom:2px;">Use All Rounds</div>
                  <p class="form-hint" style="margin-top:0;">Number of rounds equals players minus one</p>
                </div>
                <label class="toggle">
                  <input type="checkbox" id="use-all-rounds" checked>
                  <span class="toggle-track"></span>
                </label>
              </div>
            </div>
          </div>

          <div id="create-error" style="display:none;" class="section-gap-sm"></div>

          <button class="btn btn-primary btn-full btn-lg" data-action="submit-create" id="create-submit-btn">Create Game</button>
        </div>
      </div>
    </div>
  `;
}

export function setupCreateGame(container: HTMLElement): void {
  const nameInput = container.querySelector('#host-name') as HTMLInputElement;
  const drawTimer = container.querySelector('#draw-timer') as HTMLSelectElement;
  const guessTimer = container.querySelector('#guess-timer') as HTMLSelectElement;
  const promptTimer = container.querySelector('#prompt-timer') as HTMLSelectElement;
  const useAllRounds = container.querySelector('#use-all-rounds') as HTMLInputElement;
  const errorDiv = container.querySelector('#create-error') as HTMLElement;
  const submitBtn = container.querySelector('#create-submit-btn') as HTMLButtonElement;

  // Name validation
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

    if (action === 'submit-create') {
      await handleCreate(nameInput, drawTimer, guessTimer, promptTimer, useAllRounds, errorDiv, submitBtn);
    }
  });

  // Enter key in name field submits
  nameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleCreate(nameInput, drawTimer, guessTimer, promptTimer, useAllRounds, errorDiv, submitBtn);
    }
  });

  // Focus name input
  setTimeout(() => nameInput?.focus(), 100);
}

async function handleCreate(
  nameInput: HTMLInputElement,
  drawTimer: HTMLSelectElement,
  guessTimer: HTMLSelectElement,
  promptTimer: HTMLSelectElement,
  useAllRounds: HTMLInputElement,
  errorDiv: HTMLElement,
  submitBtn: HTMLButtonElement
): Promise<void> {
  const name = nameInput.value.trim();

  if (name.length < 2) {
    showError(errorDiv, 'Display name must be at least 2 characters.');
    nameInput.classList.add('error');
    nameInput.focus();
    return;
  }

  if (name.length > 16) {
    showError(errorDiv, 'Display name must be at most 16 characters.');
    nameInput.classList.add('error');
    nameInput.focus();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating...';

  try {
    const response = await createGame({
      hostDisplayName: name,
      settings: {
        drawingTimerSeconds: parseInt(drawTimer.value, 10),
        guessingTimerSeconds: parseInt(guessTimer.value, 10),
        promptTimerSeconds: parseInt(promptTimer.value, 10),
        useAllRounds: useAllRounds.checked,
        customRoundCount: null,
      },
    });

    setState({
      gameCode: response.gameCode,
      gameId: response.gameId,
      playerId: response.playerId,
      displayName: name,
      reconnectionToken: response.reconnectionToken,
      hostPlayerId: response.playerId,
      players: [{
        id: response.playerId,
        displayName: name,
        isHost: true,
        isConnected: true,
      }],
      settings: response.settings,
      gameState: 'LOBBY',
      error: null,
    });
    saveSession();

    connectSocket(response.gameCode, response.playerId, response.reconnectionToken);
    navigateTo('lobby');
  } catch (err) {
    const msg = getErrorMessage(err);
    showError(errorDiv, msg);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Game';
  }
}

function showError(errorDiv: HTMLElement, message: string): void {
  errorDiv.style.display = 'block';
  errorDiv.innerHTML = `
    <div class="card error-card">
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
