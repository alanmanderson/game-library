/**
 * Lobby / Waiting Room screen.
 * Host: settings, start, kick. Non-host: waiting message, leave.
 */

import { getState, isHost, setState, clearSession } from '../state';
import { renderGameCode, setupGameCodeActions } from '../components/GameCode';
import { renderPlayerList } from '../components/PlayerList';
import { navigateTo, showToast } from '../app';
import { emitStartGame, emitKickPlayer, emitSettings, emitLeave, disconnectSocket } from '../socket';

export function renderLobby(): string {
  const state = getState();
  const amHost = isHost();
  const playerCount = state.players.length;
  const canStart = playerCount >= 4;

  const gameCodeHtml = renderGameCode();
  const playerListHtml = renderPlayerList({ showKickControls: amHost });

  const settingsHtml = amHost ? renderHostSettings() : renderSettingsSummary();

  const actionHtml = amHost
    ? `
      <button class="btn btn-primary btn-full btn-lg" data-action="start-game" ${canStart ? '' : 'disabled'}>
        Start Game
      </button>
      <p class="text-caption text-muted text-center" style="margin-top:var(--sp-2);">
        ${canStart ? `${playerCount} players ready` : `Need at least 4 players (${playerCount} joined)`}
      </p>
    `
    : `
      <div class="waiting-state">
        <div class="waiting-spinner"></div>
        <p class="text-muted">Waiting for host to start the game...</p>
      </div>
      <button class="btn btn-secondary btn-full" data-action="leave-game">Leave Game</button>
    `;

  return `
    <div class="screen active" id="screen-lobby">
      <div class="screen-content">
        <div style="padding-top:var(--sp-6);">
          ${gameCodeHtml}

          <div class="card section-gap">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-4);">
              <h3>Players</h3>
              <span class="text-sm text-muted">
                <span style="font-weight:600;color:${playerCount >= 4 ? 'var(--success)' : 'var(--gray-700)'};">${playerCount}</span> / 20
              </span>
            </div>
            ${playerListHtml}
          </div>

          ${settingsHtml}

          ${actionHtml}
        </div>
      </div>
    </div>
  `;
}

function renderHostSettings(): string {
  const state = getState();
  const s = state.settings;

  return `
    <div class="card section-gap">
      <h3 style="margin-bottom:var(--sp-4);">Settings</h3>
      <div class="form-group">
        <label class="form-label">Drawing Timer</label>
        <select class="form-select" data-setting="drawingTimerSeconds">
          ${[30, 45, 60, 90, 120].map((v) => `<option value="${v}" ${v === s.drawingTimerSeconds ? 'selected' : ''}>${v} seconds</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Guessing Timer</label>
        <select class="form-select" data-setting="guessingTimerSeconds">
          ${[15, 20, 30, 45, 60].map((v) => `<option value="${v}" ${v === s.guessingTimerSeconds ? 'selected' : ''}>${v} seconds</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Prompt Timer</label>
        <select class="form-select" data-setting="promptTimerSeconds">
          ${[15, 20, 30, 45, 60].map((v) => `<option value="${v}" ${v === s.promptTimerSeconds ? 'selected' : ''}>${v} seconds</option>`).join('')}
        </select>
      </div>
      <div style="border-top:1px solid var(--gray-100);padding-top:var(--sp-4);margin-top:var(--sp-2);">
        <div class="toggle-row">
          <div>
            <div class="form-label" style="margin-bottom:2px;">Use All Rounds</div>
            <p class="form-hint" style="margin-top:0;">Rounds = players - 1</p>
          </div>
          <label class="toggle">
            <input type="checkbox" data-setting="useAllRounds" ${s.useAllRounds ? 'checked' : ''}>
            <span class="toggle-track"></span>
          </label>
        </div>
      </div>
    </div>
  `;
}

function renderSettingsSummary(): string {
  const state = getState();
  const s = state.settings;
  const playerCount = state.players.length;
  const roundCount = s.useAllRounds ? Math.max(playerCount - 1, 1) : (s.customRoundCount || playerCount - 1);

  return `
    <div class="card section-gap">
      <h3 style="margin-bottom:var(--sp-4);">Settings</h3>
      <div class="setting-row">
        <span class="setting-label">Drawing Timer</span>
        <span class="setting-value">${s.drawingTimerSeconds}s</span>
      </div>
      <div class="setting-row">
        <span class="setting-label">Guessing Timer</span>
        <span class="setting-value">${s.guessingTimerSeconds}s</span>
      </div>
      <div class="setting-row">
        <span class="setting-label">Prompt Timer</span>
        <span class="setting-value">${s.promptTimerSeconds}s</span>
      </div>
      <div class="setting-row">
        <span class="setting-label">Rounds</span>
        <span class="setting-value">${s.useAllRounds ? `All (${roundCount})` : roundCount}</span>
      </div>
    </div>
  `;
}

export function setupLobby(container: HTMLElement): void {
  setupGameCodeActions(container);

  // Settings changes (host only)
  container.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    const setting = target.dataset?.setting;
    if (!setting) return;

    if (setting === 'useAllRounds') {
      emitSettings({ useAllRounds: (target as HTMLInputElement).checked });
    } else {
      const value = parseInt((target as HTMLSelectElement).value, 10);
      emitSettings({ [setting]: value });
    }
  });

  // Button actions
  container.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;

    const action = target.dataset.action;

    if (action === 'start-game') {
      emitStartGame();
    }

    if (action === 'leave-game') {
      emitLeave();
      disconnectSocket();
      clearSession();
      setState({ error: null });
      navigateTo('landing');
    }

    if (action === 'kick') {
      const playerId = target.dataset.playerId;
      if (playerId) {
        emitKickPlayer(playerId);
      }
    }
  });
}
