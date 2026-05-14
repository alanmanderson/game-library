import { create } from 'zustand';
import type { ClientGameState } from '@forbidden-island/shared/types/game';
import type { LobbyState, GameListEntry } from '@forbidden-island/shared/types/lobby';
import type { ClientMessage, ServerMessage } from '@forbidden-island/shared/types/protocol';

// ─── Reconnect info stored in sessionStorage ────────────────────────────
interface RejoinInfo {
  gameId: string;
  playerId: string;
  secret: string;
}

// ─── Store shape ────────────────────────────────────────────────────────
interface Store {
  // Connection
  ws: WebSocket | null;
  playerId: string | null;
  secret: string | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';

  // Lobby
  currentLobby: LobbyState | null;
  gameList: GameListEntry[];

  // Game
  gameState: ClientGameState | null;

  // Rejoin
  rejoinInfo: RejoinInfo | null;

  // UI
  selectedTile: string | null;
  selectedCard: number | null;
  activeActionMode: string | null;
  validTargets: Record<string, string>;

  // Actions
  send: (msg: ClientMessage) => void;
  setWs: (ws: WebSocket | null) => void;
  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected') => void;
  handleServerMessage: (msg: ServerMessage) => void;
  setActiveActionMode: (mode: string | null) => void;
  setSelectedTile: (tileId: string | null) => void;
  setSelectedCard: (index: number | null) => void;
  setValidTargets: (targets: Record<string, string>) => void;
}

function loadRejoinInfo(): RejoinInfo | null {
  try {
    const raw = sessionStorage.getItem('fi-rejoin');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveRejoinInfo(info: RejoinInfo | null) {
  if (info) {
    sessionStorage.setItem('fi-rejoin', JSON.stringify(info));
  } else {
    sessionStorage.removeItem('fi-rejoin');
  }
}

export const useStore = create<Store>((set, get) => ({
  // Connection
  ws: null,
  playerId: null,
  secret: null,
  connectionStatus: 'disconnected',

  // Lobby
  currentLobby: null,
  gameList: [],

  // Game
  gameState: null,

  // Rejoin
  rejoinInfo: loadRejoinInfo(),

  // UI
  selectedTile: null,
  selectedCard: null,
  activeActionMode: null,
  validTargets: {},

  // ─── Send message via WebSocket ─────────────────────────────────────
  send: (msg: ClientMessage) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  },

  setWs: (ws) => set({ ws }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setActiveActionMode: (mode) => set({ activeActionMode: mode, validTargets: {} }),
  setSelectedTile: (tileId) => set({ selectedTile: tileId }),
  setSelectedCard: (index) => set({ selectedCard: index }),
  setValidTargets: (targets) => set({ validTargets: targets }),

  // ─── Handle incoming server messages ────────────────────────────────
  handleServerMessage: (msg: ServerMessage) => {
    switch (msg.type) {
      case 'lobby:identity':
        set({ playerId: msg.playerId, secret: msg.secret });
        break;

      case 'lobby:created':
        set({ currentLobby: msg.lobbyState });
        // save rejoin info
        {
          const info: RejoinInfo = { gameId: msg.gameId, playerId: get().playerId!, secret: get().secret! };
          set({ rejoinInfo: info });
          saveRejoinInfo(info);
        }
        // navigate happens in the component
        break;

      case 'lobby:updated':
        set({ currentLobby: msg.lobbyState });
        break;

      case 'lobby:error':
        console.error('[lobby:error]', msg.message);
        break;

      case 'lobby:game_list_updated':
        set({ gameList: msg.games });
        break;

      case 'game:started':
        set({ gameState: msg.gameState, currentLobby: null });
        {
          const gs = msg.gameState;
          const info: RejoinInfo = { gameId: gs.id, playerId: gs.myPlayerId, secret: get().secret! };
          set({ rejoinInfo: info });
          saveRejoinInfo(info);
        }
        break;

      case 'game:state':
        set({ gameState: msg.gameState });
        break;

      case 'game:flood_reveal':
      case 'game:tile_sunk':
      case 'game:waters_rise':
      case 'game:treasure_captured':
      case 'game:player_must_swim':
      case 'game:player_must_discard':
      case 'game:turn_changed':
      case 'game:treasure_draw':
        // These are animation events; for now just let game:state handle the actual state update
        break;

      case 'game:won':
      case 'game:lost':
        set({ gameState: msg.gameState });
        break;

      case 'game:player_disconnected':
      case 'game:player_reconnected':
        // Handled by subsequent game:state
        break;

      case 'game:error':
        console.error('[game:error]', msg.message);
        break;
    }
  },
}));
