import { useCallback, useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  HAPTICS_STORAGE_KEY,
  refreshHapticsEnabledCache,
  setHapticsEnabledCache,
} from "../haptics";

/**
 * Reads and writes the haptics-enabled flag from AsyncStorage. Mirrors the
 * shape of web's `useAudioEnabled` so the surface area is consistent across
 * platforms.
 *
 * Default is `true` (unset storage => haptics on, matching audio).
 *
 * AsyncStorage is asynchronous and has no change-notification mechanism, so
 * we keep an in-module mutable snapshot + listener set and notify subscribers
 * from the `setEnabled` writer. On mount we kick off a one-shot read to
 * hydrate the cache from disk; until it resolves we show the default (`true`).
 */

let snapshot: boolean = true;
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): boolean {
  return snapshot;
}

export function useHapticsEnabled(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, getSnapshot);

  // One-shot hydration from AsyncStorage. Runs once per app session (module-
  // level flag) so multiple consumers don't each hit disk.
  useEffect(() => {
    if (hydrated) return;
    hydrated = true;
    refreshHapticsEnabledCache().then((v) => {
      snapshot = v;
      notify();
    });
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    snapshot = next;
    setHapticsEnabledCache(next);
    notify();
    // Best-effort persist; if storage fails the in-memory state still wins
    // for this session, matching the web hook's silent-fail behaviour.
    AsyncStorage.setItem(HAPTICS_STORAGE_KEY, next ? "true" : "false").catch(
      () => {},
    );
  }, []);

  return [enabled, setEnabled];
}
