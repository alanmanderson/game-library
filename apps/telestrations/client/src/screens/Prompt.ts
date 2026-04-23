/**
 * Prompt writing phase.
 */

import { getState } from '../state';
import { renderTimer, startTimerLoop, stopTimerLoop, getRemainingMs } from '../components/Timer';
import { emitSubmit } from '../socket';
import { navigateTo, showToast } from '../app';

let submitted = false;
let autoSubmitFrame: number | null = null;

export function renderPrompt(): string {
  return `
    <div class="screen active" id="screen-prompt">
      <div class="screen-content">
        <div style="padding-top:var(--sp-6);">
          <div style="text-align:center;margin-bottom:var(--sp-6);">
            ${renderTimer()}
          </div>

          <div class="round-info">
            <span class="round-badge">Prompt Phase</span>
            <span>Round 0</span>
          </div>

          <div class="instructions">
            Write a word or phrase for someone to draw!
          </div>

          <div class="card">
            <div class="form-group" style="margin-bottom:var(--sp-4);">
              <label class="form-label" for="prompt-input">Your prompt</label>
              <input type="text" id="prompt-input" class="form-input" placeholder="e.g. birthday party, flying elephant..." maxlength="80" style="font-size:1.125rem;" autocomplete="off">
              <p class="form-hint"><span id="prompt-char-count">0</span>/80 characters</p>
            </div>
            <button class="btn btn-primary btn-full" data-action="submit-prompt" id="prompt-submit-btn">Submit</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function setupPrompt(container: HTMLElement): void {
  submitted = false;

  const timerEl = container.querySelector('#game-timer') as HTMLElement;
  const input = container.querySelector('#prompt-input') as HTMLInputElement;
  const charCount = container.querySelector('#prompt-char-count') as HTMLElement;
  const submitBtn = container.querySelector('#prompt-submit-btn') as HTMLButtonElement;

  if (timerEl) startTimerLoop(timerEl);

  // Character count
  input?.addEventListener('input', () => {
    if (charCount) charCount.textContent = String(input.value.length);
  });

  // Submit
  container.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    if (target.dataset.action === 'submit-prompt') {
      submitPrompt(input, submitBtn);
    }
  });

  // Enter key
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitPrompt(input, submitBtn);
    }
  });

  // Auto-submit on timer expiry
  setupAutoSubmit(input);

  // Focus input
  setTimeout(() => input?.focus(), 100);
}

function submitPrompt(input: HTMLInputElement, btn: HTMLButtonElement): void {
  if (submitted) return;

  const content = input.value.trim();
  if (content.length === 0) {
    showToast('Please enter a prompt');
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
        // Server auto-assigns random prompt if empty
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

export function cleanupPrompt(): void {
  stopTimerLoop();
  cancelAutoSubmit();
}
