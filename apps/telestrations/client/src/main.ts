/**
 * Entry point for the Telestrations client.
 */

import './styles/main.css';
import { initApp, navigateTo } from './app';
import { getState, loadSession, setState, saveSession } from './state';
import { connectSocket } from './socket';

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  initApp();

  // Check for reconnection from sessionStorage
  const session = loadSession();
  if (session) {
    setState({
      gameCode: session.gameCode,
      playerId: session.playerId,
      displayName: session.displayName,
      reconnectionToken: session.reconnectionToken,
    });

    // Attempt to reconnect
    connectSocket(session.gameCode, session.playerId, session.reconnectionToken);
  } else {
    // Check for join code in URL
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      navigateTo('join');
    } else {
      navigateTo('landing');
    }
  }
});

// Handle page visibility changes for reconnection
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const session = loadSession();
    if (session) {
      // Socket.IO will handle reconnection automatically,
      // but we may need to re-sync state
    }
  }
});

// Warn before leaving during active game
window.addEventListener('beforeunload', (e) => {
  const { screen } = getState();
  const activeScreens = new Set(['lobby', 'prompt', 'drawing', 'guessing', 'waiting', 'transition', 'review']);
  if (activeScreens.has(screen)) {
    e.preventDefault();
  }
});
