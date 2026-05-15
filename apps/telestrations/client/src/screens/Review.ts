/**
 * Review phase - chain entries revealed one at a time.
 * Host controls navigation with 4-button bar, all players see same view.
 */

import { getState, isHost } from '../state';
import {
  emitReviewNextEntry,
  emitReviewPrevEntry,
  emitReviewNextChain,
  emitReviewPrevChain,
} from '../socket';

// ===== SVG Icons =====

const ARROW_DOWN_ICON = `<svg width="20" height="24" viewBox="0 0 20 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="10" y1="0" x2="10" y2="24"/><polyline points="6 18 10 24 14 18"/></svg>`;

const CHEVRON_LEFT = `<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>`;
const CHEVRON_RIGHT = `<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>`;
const DOUBLE_CHEVRON_LEFT = `<svg viewBox="0 0 24 24"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>`;
const DOUBLE_CHEVRON_RIGHT = `<svg viewBox="0 0 24 24"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>`;
const CHECKMARK_ICON = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;

// Track previous chain index to detect chain changes for scroll behavior
let previousChainIndex: number = -1;

export function renderReview(): string {
  const state = getState();
  const review = state.reviewData;
  const amHost = isHost();

  if (!review) {
    return `
      <div class="screen active" id="screen-review">
        <div class="screen-content wide" style="max-width:520px;">
          <div class="transition-screen">
            <div class="waiting-spinner"></div>
            <h2>Time to see the results!</h2>
            <p class="text-muted">Waiting for host to start the review...</p>
          </div>
        </div>
      </div>
    `;
  }

  const entries = review.revealedEntries;
  const chainNum = review.currentChainIndex + 1;
  const entryNum = review.currentEntryIndex + 1;

  // Progress dots - now we know totalEntries from the server payload
  const progressDotsHtml = renderProgressDots(entryNum, review.totalEntries);

  // Render chain entries
  const entriesHtml = entries.map((entry, idx) => {
    const typeLabel = entry.type === 'PROMPT' ? 'Prompt' :
      entry.type === 'DRAWING' ? 'Drawing' : 'Guess';

    let contentHtml = '';
    if (entry.type === 'DRAWING') {
      contentHtml = `
        <div class="chain-drawing-card">
          <img src="${escapeHtml(entry.content)}" alt="Drawing by ${escapeHtml(entry.playerDisplayName)}" loading="eager">
        </div>
      `;
    } else {
      contentHtml = `
        <div class="chain-text-card">
          ${escapeHtml(entry.content)}
        </div>
      `;
    }

    const connector = idx < entries.length - 1
      ? `<div class="chain-connector">${ARROW_DOWN_ICON}</div>`
      : '';

    return `
      <div class="chain-entry" style="animation-delay:${idx * 100}ms;">
        <div class="chain-entry-header">
          <span class="chain-entry-type">${typeLabel}</span>
          <span class="chain-entry-author">${escapeHtml(entry.playerDisplayName)}</span>
        </div>
        ${contentHtml}
      </div>
      ${connector}
    `;
  }).join('');

  // Bottom section: host gets the sticky bar, non-host gets a message
  const bottomContent = amHost
    ? `<p class="text-caption text-muted text-center" style="margin-top: var(--sp-4); padding-bottom: var(--sp-2);">Host controls -- all players see the same view</p>`
    : `
      <div class="non-host-msg">
        <div class="icon" style="margin-bottom: var(--sp-2);">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <p>Host is controlling the review</p>
      </div>
    `;

  // Host sticky bar
  const reviewBar = amHost ? renderReviewBar(review) : '';

  return `
    <div class="screen active" id="screen-review">
      <div class="screen-content review-screen-content" style="max-width:520px;">
        <div class="chain-header" style="padding-top: var(--sp-6);">
          <p class="chain-indicator">Chain ${chainNum} of ${review.totalChains}</p>
          <h2 class="chain-title">Started by ${escapeHtml(review.chainOriginPlayerDisplayName)}</h2>
        </div>

        <div class="entry-progress">
          <div class="progress-dots">
            ${progressDotsHtml}
          </div>
          <span class="progress-fraction">Entry ${entryNum} of ${review.totalEntries}</span>
        </div>

        <div class="chain-entries">
          ${entriesHtml}
        </div>

        ${bottomContent}
      </div>
    </div>
    ${reviewBar}
  `;
}

function renderProgressDots(current: number, total: number): string {
  const dots = [];
  for (let i = 1; i <= total; i++) {
    if (i < current) {
      dots.push('<span class="progress-dot filled"></span>');
    } else if (i === current) {
      dots.push('<span class="progress-dot current"></span>');
    } else {
      dots.push('<span class="progress-dot"></span>');
    }
  }
  return dots.join('');
}

function renderReviewBar(review: NonNullable<ReturnType<typeof getState>['reviewData']>): string {
  const prevChainDisabled = review.currentChainIndex === 0 ? 'disabled' : '';
  const prevEntryDisabled = review.currentEntryIndex === 0 ? 'disabled' : '';
  const nextEntryDisabled = review.isLastEntryInChain ? 'disabled' : '';

  let nextChainBtn: string;
  if (review.isLastChain) {
    nextChainBtn = `
      <button class="review-btn review-btn-finish" data-action="review-next-chain" aria-label="Finish game">
        <span class="review-btn-text">Finish</span>
        <span class="icon">${CHECKMARK_ICON}</span>
      </button>
    `;
  } else {
    nextChainBtn = `
      <button class="review-btn review-btn-chain" data-action="review-next-chain" aria-label="Next chain">
        <span class="review-btn-text">Next Chain</span>
        <span class="icon">${DOUBLE_CHEVRON_RIGHT}</span>
      </button>
    `;
  }

  return `
    <div class="review-bar" id="review-bar">
      <div class="review-bar-inner">
        <button class="review-btn review-btn-chain" data-action="review-prev-chain" aria-label="Previous chain" ${prevChainDisabled}>
          <span class="icon">${DOUBLE_CHEVRON_LEFT}</span>
          <span class="review-btn-text">Prev Chain</span>
        </button>
        <button class="review-btn review-btn-entry" data-action="review-prev-entry" aria-label="Previous entry" ${prevEntryDisabled}>
          <span class="icon">${CHEVRON_LEFT}</span>
          <span class="review-btn-text">Prev</span>
        </button>
        <button class="review-btn review-btn-entry" data-action="review-next-entry" aria-label="Next entry" ${nextEntryDisabled}>
          <span class="review-btn-text">Next</span>
          <span class="icon">${CHEVRON_RIGHT}</span>
        </button>
        ${nextChainBtn}
      </div>
    </div>
  `;
}

export function setupReview(container: HTMLElement): void {
  const state = getState();
  const review = state.reviewData;

  // Delegate click events for host controls (remove first to prevent stacking on re-renders)
  container.removeEventListener('click', handleReviewClick);
  container.addEventListener('click', handleReviewClick);

  // Also listen on the review bar which is rendered outside the container (appended to body-level #app)
  // The review bar is part of the container's innerHTML so delegation works.

  // Handle scroll: if chain changed, scroll to top; otherwise scroll to latest entry
  if (review) {
    const chainChanged = previousChainIndex !== review.currentChainIndex;
    previousChainIndex = review.currentChainIndex;

    if (chainChanged) {
      // New chain -- scroll to top
      window.scrollTo(0, 0);
    } else {
      // Same chain, new entry revealed -- scroll to the latest entry
      setTimeout(() => {
        const entries = container.querySelectorAll('.chain-entry');
        const lastEntry = entries[entries.length - 1] as HTMLElement;
        lastEntry?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
    }
  }
}

function handleReviewClick(e: Event): void {
  const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
  if (!target) return;

  const action = target.dataset.action;
  switch (action) {
    case 'review-next-entry':
      emitReviewNextEntry();
      break;
    case 'review-prev-entry':
      emitReviewPrevEntry();
      break;
    case 'review-next-chain':
      emitReviewNextChain();
      break;
    case 'review-prev-chain':
      emitReviewPrevChain();
      break;
  }
}

export function cleanupReview(): void {
  // Reset chain tracking so re-entering review starts fresh
  previousChainIndex = -1;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
