/**
 * Player list component.
 * Used in lobby (with kick controls) and waiting screen (with submission status).
 */

import { getState, isHost, type PlayerInfo } from '../state';

const CHECK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const PENDING_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`;
const REMOVE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

interface PlayerListOptions {
  showKickControls?: boolean;
  showSubmissionStatus?: boolean;
}

export function renderPlayerList(options: PlayerListOptions = {}): string {
  const state = getState();
  const { showKickControls = false, showSubmissionStatus = false } = options;
  const amHost = isHost();

  return `
    <ul class="player-list">
      ${state.players.map((player) => renderPlayerItem(player, amHost, showKickControls, showSubmissionStatus)).join('')}
    </ul>
  `;
}

function renderPlayerItem(
  player: PlayerInfo,
  amHost: boolean,
  showKickControls: boolean,
  showSubmissionStatus: boolean
): string {
  const state = getState();
  const isMe = player.id === state.playerId;
  const isPlayerHost = player.id === state.hostPlayerId;
  const nameClass = player.isConnected ? 'player-name' : 'player-name disconnected';
  const hasSubmitted = state.roundData?.submittedPlayerIds.includes(player.id) ?? false;

  let badges = '';
  if (isPlayerHost) badges += '<span class="badge badge-host">HOST</span>';
  if (isMe) badges += '<span class="badge badge-you">YOU</span>';

  let rightContent = '';

  if (showSubmissionStatus) {
    if (!player.isConnected) {
      rightContent = '<span class="status-disconnected"></span>';
    } else if (hasSubmitted) {
      rightContent = `<span class="icon status-check">${CHECK_ICON}</span>`;
    } else {
      rightContent = `<span class="icon status-pending">${PENDING_ICON}</span>`;
    }
  } else if (!player.isConnected) {
    rightContent = '<span class="status-disconnected"></span>';
  } else {
    rightContent = `<span class="icon status-check" style="color:var(--success);">${CHECK_ICON}</span>`;
  }

  let kickButton = '';
  if (showKickControls && amHost && !isMe && !isPlayerHost) {
    kickButton = `
      <button class="player-remove" aria-label="Remove ${escapeHtml(player.displayName)}" data-action="kick" data-player-id="${player.id}">
        ${REMOVE_ICON}
      </button>
    `;
  }

  return `
    <li class="player-item">
      <div class="player-info">
        <span class="${nameClass}">${escapeHtml(player.displayName)}</span>
        ${badges}
      </div>
      <div class="player-status">
        ${rightContent}
        ${kickButton}
      </div>
    </li>
  `;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
