// ============================================================
// UI-Specific Types
// ============================================================

export type Screen =
  | 'main-menu'
  | 'dashboard'
  | 'stand-management'
  | 'recipe-editor'
  | 'map-view'
  | 'financial-reports'
  | 'employee-management'
  | 'upgrades-shop'
  | 'achievements'
  | 'events';

export type ModalType =
  | 'confirm'
  | 'new-game'
  | 'load-game'
  | 'settings'
  | 'hire-employee'
  | 'purchase-location'
  | 'end-of-day-report'
  | 'event-detail'
  | 'achievement-unlocked'
  | 'buy-supplies';

export interface ModalState {
  type: ModalType;
  isOpen: boolean;
  data?: Record<string, unknown>;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration: number;
}

export interface SidebarItem {
  id: Screen;
  label: string;
  icon: string;
  badge?: number;
  minStage?: number;
}
