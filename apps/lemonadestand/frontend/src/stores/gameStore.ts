// ============================================================
// Game Store (Zustand) - Central state for the active game
// ============================================================

import { create } from 'zustand';
import type { GameState, DayResult } from '@/types/game';
import type { ToastMessage } from '@/types/ui';

interface GameStore {
  // Core game state from the backend
  game: GameState | null;
  setGame: (game: GameState | null) => void;

  // Accumulated day results (frontend-only, since backend doesn't return history in GameState)
  dayResults: DayResult[];
  addDayResult: (result: DayResult) => void;
  addDayResults: (results: DayResult[]) => void;
  clearDayResults: () => void;

  // Last day result (shown in the modal)
  lastDayResult: DayResult | null;
  setLastDayResult: (result: DayResult | null) => void;

  // Is advancing day in progress
  isAdvancing: boolean;
  setIsAdvancing: (v: boolean) => void;

  // Toast notifications
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;

  // Day result modal
  showDayResult: boolean;
  setShowDayResult: (v: boolean) => void;
}

let _toastId = 0;

export const useGameStore = create<GameStore>()((set) => ({
  game: null,
  setGame: (game) => set({ game }),

  dayResults: [],
  addDayResult: (result) => set((s) => ({ dayResults: [...s.dayResults, result] })),
  addDayResults: (results) => set((s) => ({ dayResults: [...s.dayResults, ...results] })),
  clearDayResults: () => set({ dayResults: [] }),

  lastDayResult: null,
  setLastDayResult: (result) => set({ lastDayResult: result }),

  isAdvancing: false,
  setIsAdvancing: (v) => set({ isAdvancing: v }),

  toasts: [],
  addToast: (toast) => {
    const id = `toast-${++_toastId}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    if (toast.duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, toast.duration);
    }
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  showDayResult: false,
  setShowDayResult: (v) => set({ showDayResult: v }),
}));
