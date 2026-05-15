/**
 * App shell - screen routing and global UI.
 */

import {
  getState,
  setState,
  subscribe,
  type ScreenName,
  type AppState,
} from './state';
import { renderConnectionBanner, setupConnectionBanner } from './components/Header';

// Screen imports
import { renderLanding, setupLanding } from './screens/Landing';
import { renderJoinGame, setupJoinGame } from './screens/JoinGame';
import { renderCreateGame, setupCreateGame } from './screens/CreateGame';
import { renderLobby, setupLobby } from './screens/Lobby';
import { renderPrompt, setupPrompt, cleanupPrompt } from './screens/Prompt';
import { renderDrawing, setupDrawing, cleanupDrawing } from './screens/Drawing';
import { renderGuessing, setupGuessing, cleanupGuessing } from './screens/Guessing';
import { renderWaiting, setupWaiting, cleanupWaiting } from './screens/Waiting';
import { renderTransition, setupTransition, cleanupTransition } from './screens/Transition';
import { renderReview, setupReview, cleanupReview } from './screens/Review';
import { renderGameOver, setupGameOver } from './screens/GameOver';

let appRoot: HTMLElement | null = null;
let bannerContainer: HTMLElement | null = null;
let currentScreen: ScreenName | null = null;
let toastTimeout: number | null = null;
let isRendering = false;
let pendingRender: ScreenName | null = null;

// Track previous state snapshots for reactive screens to avoid needless re-renders
let prevPlayersJson = '';
let prevRoundDataSubmittedJson = '';
let prevReviewDataJson = '';
let prevSettingsJson = '';
let prevHostPlayerId = '';
let prevConnectionStatus = '';

/**
 * Initialize the app shell.
 */
export function initApp(): void {
  appRoot = document.getElementById('app');
  bannerContainer = document.getElementById('connection-banner-container');

  if (!appRoot) {
    throw new Error('Missing #app element');
  }

  if (bannerContainer) {
    setupConnectionBanner(bannerContainer);
  }

  // Subscribe to state changes
  subscribe(() => {
    const state = getState();

    // Update connection banner
    if (bannerContainer) {
      const bannerHtml = renderConnectionBanner();
      if (bannerContainer.innerHTML !== bannerHtml) {
        bannerContainer.innerHTML = bannerHtml;
      }
    }

    // Screen change -- always re-render
    if (state.screen !== currentScreen) {
      scheduleRender(state.screen);
      return;
    }

    // For reactive screens, only re-render when relevant data actually changed
    if (shouldReactiveRerender(state)) {
      scheduleRender(state.screen);
    }
  });

  // Initial render
  renderScreen(getState().screen);
}

/**
 * Determine if a reactive screen needs a re-render.
 */
function shouldReactiveRerender(state: AppState): boolean {
  const screen = state.screen;

  if (screen === 'lobby') {
    const playersJson = JSON.stringify(state.players);
    const settingsJson = JSON.stringify(state.settings);
    const hostId = state.hostPlayerId || '';
    if (playersJson !== prevPlayersJson || settingsJson !== prevSettingsJson || hostId !== prevHostPlayerId) {
      prevPlayersJson = playersJson;
      prevSettingsJson = settingsJson;
      prevHostPlayerId = hostId;
      return true;
    }
    return false;
  }

  if (screen === 'waiting') {
    const submittedJson = JSON.stringify(state.roundData?.submittedPlayerIds || []);
    const playersJson = JSON.stringify(state.players.map(p => ({ id: p.id, isConnected: p.isConnected })));
    if (submittedJson !== prevRoundDataSubmittedJson || playersJson !== prevPlayersJson) {
      prevRoundDataSubmittedJson = submittedJson;
      prevPlayersJson = playersJson;
      return true;
    }
    return false;
  }

  if (screen === 'review') {
    const reviewJson = JSON.stringify(state.reviewData);
    if (reviewJson !== prevReviewDataJson) {
      prevReviewDataJson = reviewJson;
      return true;
    }
    return false;
  }

  if (screen === 'gameover') {
    const hostId = state.hostPlayerId || '';
    if (hostId !== prevHostPlayerId) {
      prevHostPlayerId = hostId;
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Schedule a render, preventing re-entrancy.
 */
function scheduleRender(screen: ScreenName): void {
  if (isRendering) {
    pendingRender = screen;
    return;
  }
  renderScreen(screen);

  // Process any pending render that was queued during the render
  if (pendingRender !== null) {
    const next = pendingRender;
    pendingRender = null;
    renderScreen(next);
  }
}

/**
 * Navigate to a screen.
 */
export function navigateTo(screen: ScreenName): void {
  setState({ screen, error: null });
}

/**
 * Render a screen into the app root.
 */
function renderScreen(screen: ScreenName): void {
  if (!appRoot) return;
  isRendering = true;

  try {
    // Cleanup previous screen (only if actually changing screens)
    if (screen !== currentScreen) {
      cleanupCurrentScreen();
    }

    currentScreen = screen;

    // Check URL for prefill code when joining
    let prefillCode: string | undefined;
    if (screen === 'join') {
      const params = new URLSearchParams(window.location.search);
      prefillCode = params.get('code') || undefined;
    }

    // Render new screen
    let html = '';
    switch (screen) {
      case 'landing':
        html = renderLanding();
        break;
      case 'join':
        html = renderJoinGame(prefillCode);
        break;
      case 'create':
        html = renderCreateGame();
        break;
      case 'lobby':
        html = renderLobby();
        break;
      case 'prompt':
        html = renderPrompt();
        break;
      case 'drawing':
        html = renderDrawing();
        break;
      case 'guessing':
        html = renderGuessing();
        break;
      case 'waiting':
        html = renderWaiting();
        break;
      case 'transition':
        html = renderTransition();
        break;
      case 'review':
        html = renderReview();
        break;
      case 'gameover':
        html = renderGameOver();
        break;
    }

    appRoot.innerHTML = html;

    // Setup event handlers for new screen
    switch (screen) {
      case 'landing':
        setupLanding(appRoot);
        break;
      case 'join':
        setupJoinGame(appRoot);
        break;
      case 'create':
        setupCreateGame(appRoot);
        break;
      case 'lobby':
        setupLobby(appRoot);
        break;
      case 'prompt':
        setupPrompt(appRoot);
        break;
      case 'drawing':
        setupDrawing(appRoot);
        break;
      case 'guessing':
        setupGuessing(appRoot);
        break;
      case 'waiting':
        setupWaiting(appRoot);
        break;
      case 'transition':
        setupTransition(appRoot);
        break;
      case 'review':
        setupReview(appRoot);
        break;
      case 'gameover':
        setupGameOver(appRoot);
        break;
    }

    // Scroll to top on screen change
    window.scrollTo(0, 0);
  } finally {
    isRendering = false;
  }
}

function cleanupCurrentScreen(): void {
  switch (currentScreen) {
    case 'prompt':
      cleanupPrompt();
      break;
    case 'drawing':
      cleanupDrawing();
      break;
    case 'guessing':
      cleanupGuessing();
      break;
    case 'waiting':
      cleanupWaiting();
      break;
    case 'transition':
      cleanupTransition();
      break;
    case 'review':
      cleanupReview();
      break;
  }
}

/**
 * Show a toast notification.
 */
export function showToast(message: string, duration: number = 3000): void {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // Clear existing toast
  if (toastTimeout !== null) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }

  container.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;

  toastTimeout = window.setTimeout(() => {
    const toast = container.querySelector('.toast') as HTMLElement;
    if (toast) {
      toast.classList.add('dismissing');
      setTimeout(() => {
        container.innerHTML = '';
      }, 200);
    }
    toastTimeout = null;
  }, duration);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
