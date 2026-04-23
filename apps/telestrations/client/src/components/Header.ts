/**
 * App header component - shows connection status.
 */

import { getState, setState, clearSession } from '../state';
import { disconnectSocket } from '../socket';

export function renderConnectionBanner(): string {
  const state = getState();

  if (state.connectionStatus === 'connected' || state.connectionStatus === 'connecting') {
    return '';
  }

  if (state.connectionStatus === 'reconnecting') {
    return `
      <div class="connection-banner" role="alert">
        Connection lost. Reconnecting...
      </div>
    `;
  }

  if (state.connectionStatus === 'disconnected' && state.gameCode) {
    return `
      <div class="connection-banner error" role="alert">
        Unable to reconnect. You may have been removed from the game.
        <button class="btn btn-sm btn-ghost" style="margin-left: var(--sp-2);" data-action="go-home">Return Home</button>
      </div>
    `;
  }

  return '';
}

export function setupConnectionBanner(container: HTMLElement): void {
  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-action="go-home"]')) {
      disconnectSocket();
      clearSession();
      setState({ screen: 'landing', error: null });
    }
  });
}
