/**
 * Landing page - Create/Join buttons.
 */

import { navigateTo } from '../app';
import { getState } from '../state';

const PLUS_ICON = `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const LOGIN_ICON = `<svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`;

export function renderLanding(): string {
  const state = getState();
  const errorHtml = state.error
    ? `<div class="card error-card section-gap-sm"><p>${escapeHtml(state.error)}</p></div>`
    : '';

  return `
    <div class="screen active" id="screen-landing">
      <div class="screen-content">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:calc(100vh - 80px);">
          <div class="logo" style="margin-bottom:var(--sp-12);">
            <div class="logo-text">tele<span>strations</span></div>
            <p class="logo-sub">Draw, guess, laugh together</p>
          </div>

          ${errorHtml}

          <div style="width:100%;max-width:340px;display:flex;flex-direction:column;gap:var(--sp-3);">
            <button class="btn btn-primary btn-full btn-lg" data-action="create-game">
              <span class="icon">${PLUS_ICON}</span>
              Create Game
            </button>
            <button class="btn btn-secondary btn-full btn-lg" data-action="join-game">
              <span class="icon">${LOGIN_ICON}</span>
              Join Game
            </button>
          </div>

          <div style="text-align:center;padding:var(--sp-8) 0 var(--sp-4);">
            <a href="#" style="font-size:0.875rem;color:var(--gray-500);text-decoration:none;" data-action="how-to-play">How to play</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function setupLanding(container: HTMLElement): void {
  container.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    const action = target.dataset.action;
    if (action === 'create-game') {
      navigateTo('create');
    } else if (action === 'join-game') {
      navigateTo('join');
    }
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
