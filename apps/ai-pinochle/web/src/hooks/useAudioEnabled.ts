import { useCallback, useSyncExternalStore } from "react";
import { AUDIO_STORAGE_KEYS } from "../audio/sounds";

/**
 * Reads and writes the audio-enabled flag from localStorage, with cross-tab
 * sync via the `storage` event. Mirrors the pattern in `useReducedMotion`.
 *
 * Default is `true` (unset localStorage => audio on, per issue #1).
 */

const KEY = AUDIO_STORAGE_KEYS.enabled;

// Custom event so toggles in the same tab notify other hook consumers.
// localStorage's `storage` event only fires across tabs.
const SAME_TAB_EVENT = "audio-enabled-change";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(SAME_TAB_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SAME_TAB_EVENT, onChange);
  };
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function getServerSnapshot(): boolean {
  return true;
}

export function useAudioEnabled(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setEnabled = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(KEY, next ? "true" : "false");
      window.dispatchEvent(new Event(SAME_TAB_EVENT));
    } catch {
      // If storage is unavailable (private mode, etc.) we just no-op.
    }
  }, []);
  return [enabled, setEnabled];
}
