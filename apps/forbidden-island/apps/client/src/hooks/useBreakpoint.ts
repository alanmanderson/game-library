import { useSyncExternalStore } from 'react';

type Breakpoint = 'mobile' | 'tablet' | 'desktop';

const MOBILE_QUERY = '(max-width: 767px)';
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1024px)';

function getBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'desktop';
  if (window.matchMedia(MOBILE_QUERY).matches) return 'mobile';
  if (window.matchMedia(TABLET_QUERY).matches) return 'tablet';
  return 'desktop';
}

let cachedBreakpoint: Breakpoint = getBreakpoint();

const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);

  // Set up matchMedia listeners on first subscriber
  if (listeners.size === 1 && typeof window !== 'undefined') {
    const mobileMql = window.matchMedia(MOBILE_QUERY);
    const tabletMql = window.matchMedia(TABLET_QUERY);

    const handler = () => {
      const next = getBreakpoint();
      if (next !== cachedBreakpoint) {
        cachedBreakpoint = next;
        listeners.forEach((cb) => cb());
      }
    };

    mobileMql.addEventListener('change', handler);
    tabletMql.addEventListener('change', handler);

    // Store cleanup refs on the subscribe function for future cleanup
    (subscribe as any).__cleanup = () => {
      mobileMql.removeEventListener('change', handler);
      tabletMql.removeEventListener('change', handler);
    };
  }

  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && (subscribe as any).__cleanup) {
      (subscribe as any).__cleanup();
      (subscribe as any).__cleanup = null;
    }
  };
}

function getSnapshot(): Breakpoint {
  return cachedBreakpoint;
}

function getServerSnapshot(): Breakpoint {
  return 'desktop';
}

/**
 * Returns the current responsive breakpoint.
 * - 'mobile': < 768px
 * - 'tablet': 768-1024px
 * - 'desktop': > 1024px
 *
 * Uses matchMedia listeners (fires only at breakpoint transitions, not every resize).
 */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
