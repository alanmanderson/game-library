/**
 * Drawing phase screen with full canvas.
 */

import { getState } from '../state';
import { renderTimer, startTimerLoop, stopTimerLoop, getRemainingMs } from '../components/Timer';
import { DrawingCanvasController } from '../components/DrawingCanvas';
import { emitSubmit } from '../socket';
import { navigateTo } from '../app';

let canvasController: DrawingCanvasController | null = null;
let submitted = false;
let autoSubmitFrame: number | null = null;

export function renderDrawing(): string {
  const state = getState();
  const prompt = state.roundData?.prompt || '';
  const round = state.currentRound ?? 0;
  const totalRounds = state.totalRounds ?? 0;

  return `
    <div class="screen active" id="screen-drawing">
      <div class="screen-content">
        <div style="padding-top:var(--sp-6);">
          <div style="text-align:center;margin-bottom:var(--sp-4);">
            ${renderTimer()}
          </div>

          <div class="round-info">
            <span class="round-badge">Draw</span>
            <span>Round ${round} of ${totalRounds}</span>
          </div>

          <div class="prompt-display section-gap-sm">
            "${escapeHtml(prompt)}"
          </div>

          <div class="canvas-wrapper section-gap-sm" id="canvas-container">
          </div>

          <div id="toolbar-container"></div>

          <div style="margin-top:var(--sp-4);">
            <button class="btn btn-primary btn-full" data-action="submit-drawing" id="drawing-submit-btn">Done</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function setupDrawing(container: HTMLElement): void {
  submitted = false;

  const timerEl = container.querySelector('#game-timer') as HTMLElement;
  const canvasContainer = container.querySelector('#canvas-container') as HTMLElement;
  const toolbarContainer = container.querySelector('#toolbar-container') as HTMLElement;
  const submitBtn = container.querySelector('#drawing-submit-btn') as HTMLButtonElement;

  if (timerEl) startTimerLoop(timerEl);

  // Initialize canvas
  if (canvasContainer && toolbarContainer) {
    canvasController = new DrawingCanvasController(canvasContainer, toolbarContainer);
  }

  // Submit
  container.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    if (target.dataset.action === 'submit-drawing') {
      submitDrawing(submitBtn);
    }
  });

  // Auto-submit on timer expiry
  setupAutoSubmit();
}

function submitDrawing(btn: HTMLButtonElement): void {
  if (submitted || !canvasController) return;
  submitted = true;

  const dataUri = canvasController.export();
  btn.disabled = true;
  btn.textContent = 'Submitted';

  emitSubmit(dataUri);
  stopTimerLoop();
  cancelAutoSubmit();
  navigateTo('waiting');
}

function setupAutoSubmit(): void {
  const check = () => {
    if (submitted) return;
    const remaining = getRemainingMs();
    if (remaining <= 0) {
      if (!submitted && canvasController) {
        submitted = true;
        const dataUri = canvasController.export();
        emitSubmit(dataUri);
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

export function cleanupDrawing(): void {
  stopTimerLoop();
  cancelAutoSubmit();
  if (canvasController) {
    canvasController.destroy();
    canvasController = null;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
