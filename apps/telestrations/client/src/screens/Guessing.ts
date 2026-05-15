/**
 * Guessing phase - see a drawing, write a guess.
 */

import { getState } from '../state';
import { renderTimer, startTimerLoop, stopTimerLoop, getRemainingMs } from '../components/Timer';
import { emitSubmit } from '../socket';
import { navigateTo, showToast } from '../app';

let submitted = false;
let autoSubmitFrame: number | null = null;

export function renderGuessing(): string {
  const state = getState();
  const drawing = state.roundData?.drawing || '';
  const round = state.currentRound ?? 0;
  const totalRounds = state.totalRounds ?? 0;

  return `
    <div class="screen active" id="screen-guessing">
      <div class="screen-content">
        <div style="padding-top:var(--sp-6);">
          <div style="text-align:center;margin-bottom:var(--sp-4);">
            ${renderTimer()}
          </div>

          <div class="round-info">
            <span class="round-badge">Guess</span>
            <span>Round ${round} of ${totalRounds}</span>
          </div>

          <p class="text-sm text-muted text-center section-gap-sm">What do you think this drawing is?</p>

          <div class="guess-drawing-container section-gap-sm">
            ${drawing ? `<img src="${drawing}" alt="Drawing to guess" loading="eager">` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--gray-300);">No drawing available</div>'}
          </div>

          <div class="card">
            <div class="form-group" style="margin-bottom:var(--sp-4);">
              <label class="form-label" for="guess-input">Your guess</label>
              <input type="text" id="guess-input" class="form-input" placeholder="Type your guess..." maxlength="80" style="font-size:1.125rem;" autocomplete="off">
              <p class="form-hint"><span id="guess-char-count">0</span>/80 characters</p>
            </div>
            <button class="btn btn-primary btn-full" data-action="submit-guess" id="guess-submit-btn">Submit</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function setupGuessing(container: HTMLElement): void {
  submitted = false;

  const timerEl = container.querySelector('#game-timer') as HTMLElement;
  const input = container.querySelector('#guess-input') as HTMLInputElement;
  const charCount = container.querySelector('#guess-char-count') as HTMLElement;
  const submitBtn = container.querySelector('#guess-submit-btn') as HTMLButtonElement;

  if (timerEl) startTimerLoop(timerEl);

  // Character count
  input?.addEventListener('input', () => {
    if (charCount) charCount.textContent = String(input.value.length);
  });

  // Submit
  container.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    if (target.dataset.action === 'submit-guess') {
      submitGuess(input, submitBtn);
    }
  });

  // Enter key
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitGuess(input, submitBtn);
    }
  });

  // Auto-submit on timer expiry
  setupAutoSubmit(input);

  // Focus input
  setTimeout(() => input?.focus(), 100);
}

function submitGuess(input: HTMLInputElement, btn: HTMLButtonElement): void {
  if (submitted) return;

  const content = input.value.trim();
  if (content.length === 0) {
    showToast('Please enter a guess');
    input.focus();
    return;
  }

  submitted = true;
  btn.disabled = true;
  btn.textContent = 'Submitted';
  input.disabled = true;

  emitSubmit(content);
  stopTimerLoop();
  cancelAutoSubmit();
  navigateTo('waiting');
}

function setupAutoSubmit(input: HTMLInputElement): void {
  const check = () => {
    if (submitted) return;
    const remaining = getRemainingMs();
    if (remaining <= 0) {
      if (!submitted) {
        submitted = true;
        const content = input.value.trim();
        if (content.length > 0) {
          emitSubmit(content);
        }
        // Server auto-submits "???" if empty
        stopTimerLoop();
        navigateTo('waiting');
      }
      return;
    }
    autoSubmitFrame = requestAnimationFrame(check);
  };
  autoSubmitFrame = requestAnimationFrame(check);
}

function cancelAutoSubmit(): void {
  if (autoSubmitFrame !== null) {
    cancelAnimationFrame(autoSubmitFrame);
    autoSubmitFrame = null;
  }
}

export function cleanupGuessing(): void {
  stopTimerLoop();
  cancelAutoSubmit();
}
