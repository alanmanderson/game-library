import { useSyncExternalStore } from "react";

/**
 * Subscribes to `prefers-reduced-motion: reduce` and returns the current
 * boolean. Animation helpers use this to short-circuit to duration 0.
 *
 * Implemented via `useSyncExternalStore` so the media-query matcher is the
 * source of truth — no effect-driven setState cascade on mount.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
