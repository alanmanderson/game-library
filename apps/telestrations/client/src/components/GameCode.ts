/**
 * Game code display component with Copy and Share buttons.
 */

import { getState } from '../state';
import { showToast } from '../app';

const COPY_ICON = `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const SHARE_ICON = `<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

export function renderGameCode(): string {
  const state = getState();
  const code = state.gameCode || '----';

  return `
    <div class="game-code-container section-gap">
      <p class="game-code-label">Game Code</p>
      <div class="game-code">${code}</div>
      <div class="game-code-actions">
        <button class="btn btn-sm game-code-btn" data-action="copy-code" aria-label="Copy game code">
          <span class="icon">${COPY_ICON}</span>
          Copy
        </button>
        <button class="btn btn-sm game-code-btn" data-action="share-code" aria-label="Share game code">
          <span class="icon">${SHARE_ICON}</span>
          Share
        </button>
      </div>
    </div>
  `;
}

export function setupGameCodeActions(container: HTMLElement): void {
  container.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    const action = target.dataset.action;
    const state = getState();
    const code = state.gameCode;
    if (!code) return;

    const shareUrl = `${window.location.origin}/?code=${code}`;

    if (action === 'copy-code') {
      try {
        await navigator.clipboard.writeText(code);
        showToast('Game code copied!');
      } catch {
        // Fallback
        fallbackCopy(code);
        showToast('Game code copied!');
      }
    }

    if (action === 'share-code') {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Join my Telestrations game!',
            text: `Join my Telestrations game with code ${code}`,
            url: shareUrl,
          });
        } catch (err) {
          // User cancelled share, ignore
          if ((err as Error).name !== 'AbortError') {
            // Fallback to copy
            try {
              await navigator.clipboard.writeText(shareUrl);
              showToast('Link copied!');
            } catch {
              fallbackCopy(shareUrl);
              showToast('Link copied!');
            }
          }
        }
      } else {
        // No Web Share API, copy link
        try {
          await navigator.clipboard.writeText(shareUrl);
          showToast('Link copied!');
        } catch {
          fallbackCopy(shareUrl);
          showToast('Link copied!');
        }
      }
    }
  });
}

function fallbackCopy(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch {
    // ignore
  }
  document.body.removeChild(textarea);
}
