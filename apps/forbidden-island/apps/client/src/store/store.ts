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

// ─── Animation queue ────────────────────────────────────────────────────
export interface AnimationEvent {
  id: string;
  type: 'flood_reveal' | 'tile_sunk' | 'waters_rise' | 'treasure_captured' | 'treasure_draw' | 'pawn_move';
  payload: Record<string, unknown>;
  duration: number; // ms
}

// ─── Overlay types ──────────────────────────────────────────────────────
export type OverlayType =
  | 'waters_rise'
  | 'discard'
  | 'swim'
  | 'helicopter_lift'
  | 'sandbags'
  | 'navigator'
  | 'draw_treasure'
  | 'draw_flood'
  | null;

export interface OverlayData {
  // Waters Rise
  newWaterLevel?: number;
  oldWaterLevel?: number;
  // Discard
  discardingPlayerId?: string;
  // Swim
  swimmingPlayerId?: string;
  sunkTileId?: string;
  swimTargets?: string[];
  // Helicopter Lift
  heliCardId?: string;
  heliSelectedPlayerIds?: string[];
  heliSourceTileId?: string;
  // Sandbags
  sandbagsCardId?: string;
  // Navigator
  navigatorTargetPlayerId?: string;
  navigatorHops?: Array<{ from: string; to: string }>;
  // Draw phase
  drawnCards?: Array<{ type: string; id?: string; isWatersRise?: boolean }>;
  floodReveals?: Array<{ tileId: string; tileName: string; newState: string }>;
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

  // Animation queue
  animationQueue: AnimationEvent[];
  currentAnimation: AnimationEvent | null;
  isAnimating: boolean;

  // Overlays
  activeOverlay: OverlayType;
  overlayData: OverlayData;

  // Actions
  send: (msg: ClientMessage) => void;
  setWs: (ws: WebSocket | null) => void;
  setConnectionStatus: (status: 'connecting' | 'connected' | 'disconnected') => void;
  handleServerMessage: (msg: ServerMessage) => void;
  setActiveActionMode: (mode: string | null) => void;
  setSelectedTile: (tileId: string | null) => void;
  setSelectedCard: (index: number | null) => void;
  setValidTargets: (targets: Record<string, string>) => void;

  // Animation actions
  enqueueAnimation: (event: AnimationEvent) => void;
  dequeueAnimation: () => void;
  setCurrentAnimation: (event: AnimationEvent | null) => void;

  // Overlay actions
  openOverlay: (overlay: OverlayType, data?: Partial<OverlayData>) => void;
  closeOverlay: () => void;
  updateOverlayData: (data: Partial<OverlayData>) => void;
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

let animIdCounter = 0;
function nextAnimId(): string {
  return `anim_${++animIdCounter}_${Date.now()}`;
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

  // Animation queue
  animationQueue: [],
  currentAnimation: null,
  isAnimating: false,

  // Overlays
  activeOverlay: null,
  overlayData: {},

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

  // ─── Animation queue actions ────────────────────────────────────────
  enqueueAnimation: (event) => {
    set((s) => ({
      animationQueue: [...s.animationQueue, event],
      isAnimating: true,
    }));
  },
  dequeueAnimation: () => {
    set((s) => {
      const next = s.animationQueue.slice(1);
      return {
        animationQueue: next,
        currentAnimation: null,
        isAnimating: next.length > 0,
      };
    });
  },
  setCurrentAnimation: (event) => set({ currentAnimation: event }),

  // ─── Overlay actions ────────────────────────────────────────────────
  openOverlay: (overlay, data = {}) => {
    set({ activeOverlay: overlay, overlayData: data });
  },
  closeOverlay: () => {
    set({ activeOverlay: null, overlayData: {} });
  },
  updateOverlayData: (data) => {
    set((s) => ({ overlayData: { ...s.overlayData, ...data } }));
  },

  // ─── Handle incoming server messages ────────────────────────────────
  handleServerMessage: (msg: ServerMessage) => {
    const { enqueueAnimation, openOverlay, overlayData } = get();

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
        // Auto-open phase-driven overlays
        {
          const gs = msg.gameState;
          if (gs.phase === 'discard' && gs.discardingPlayerId) {
            openOverlay('discard', { discardingPlayerId: gs.discardingPlayerId });
          } else if (gs.phase === 'swim' && gs.swimmingPlayerId) {
            openOverlay('swim', { swimmingPlayerId: gs.swimmingPlayerId });
          } else if (gs.phase === 'draw_treasure') {
            const current = get().activeOverlay;
            if (current !== 'draw_treasure' && current !== 'waters_rise') {
              openOverlay('draw_treasure', { drawnCards: [] });
            }
          } else if (gs.phase === 'draw_flood') {
            const current = get().activeOverlay;
            if (current !== 'draw_flood') {
              openOverlay('draw_flood', { floodReveals: [] });
            }
          } else if (gs.phase === 'action') {
            // Flush any pending animations and close phase-driven overlays when
            // returning to the action phase. The server resolves draw/flood phases
            // server-side and sends the final state in one batch, so animation
            // events (treasure_draw, flood_reveal, etc.) are already reflected in
            // the game state. Without this flush the animation timers keep
            // isAnimating===true, which blocks all input with a "RESOLVING..." banner.
            set({ activeOverlay: null, overlayData: {}, animationQueue: [], currentAnimation: null, isAnimating: false });
          }
        }
        break;

      case 'game:flood_reveal':
        enqueueAnimation({
          id: nextAnimId(),
          type: 'flood_reveal',
          payload: { tileId: msg.floodCard.tileName, tileName: msg.tileName, newTileState: msg.newTileState },
          duration: 800,
        });
        // Also accumulate into draw_flood overlay data
        {
          const currentReveals = get().overlayData.floodReveals || [];
          set((s) => ({
            overlayData: {
              ...s.overlayData,
              floodReveals: [...currentReveals, { tileId: msg.floodCard.tileName, tileName: msg.tileName, newState: msg.newTileState }],
            },
          }));
        }
        break;

      case 'game:tile_sunk':
        enqueueAnimation({
          id: nextAnimId(),
          type: 'tile_sunk',
          payload: { tileName: msg.tileName, position: msg.position },
          duration: 1000,
        });
        break;

      case 'game:waters_rise':
        enqueueAnimation({
          id: nextAnimId(),
          type: 'waters_rise',
          payload: { newWaterLevel: msg.newWaterLevel },
          duration: 2500,
        });
        {
          const oldLevel = get().gameState?.waterLevel ?? (msg.newWaterLevel - 1);
          openOverlay('waters_rise', { newWaterLevel: msg.newWaterLevel, oldWaterLevel: oldLevel });
        }
        break;

      case 'game:treasure_captured':
        enqueueAnimation({
          id: nextAnimId(),
          type: 'treasure_captured',
          payload: { treasureType: msg.treasureType, playerId: msg.playerId },
          duration: 2000,
        });
        break;

      case 'game:treasure_draw':
        enqueueAnimation({
          id: nextAnimId(),
          type: 'treasure_draw',
          payload: { card: msg.card, playerId: msg.playerId, isWatersRise: msg.isWatersRise },
          duration: 1000,
        });
        // Accumulate into draw_treasure overlay data
        {
          const currentDrawn = get().overlayData.drawnCards || [];
          const cardEntry = msg.card
            ? { type: msg.card.type, id: msg.card.id, isWatersRise: msg.isWatersRise }
            : { type: 'waters_rise', isWatersRise: true };
          set((s) => ({
            overlayData: {
              ...s.overlayData,
              drawnCards: [...currentDrawn, cardEntry],
            },
          }));
        }
        break;

      case 'game:player_must_swim':
        // This will be handled when game:state arrives with phase='swim'
        break;

      case 'game:player_must_discard':
        // This will be handled when game:state arrives with phase='discard'
        break;

      case 'game:turn_changed':
        // Clear action mode on turn change
        set({ activeActionMode: null, validTargets: {} });
        break;

      case 'game:won':
      case 'game:lost':
        set({ gameState: msg.gameState, activeOverlay: null, overlayData: {}, animationQueue: [], currentAnimation: null, isAnimating: false });
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
