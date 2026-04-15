/**
 * Thin wrapper around expo-haptics.
 *
 * Each cue maps a semantic name (e.g. "medium", "success") onto the matching
 * iOS/Android feedback. `triggerHaptic` is fire-and-forget — we do not await,
 * and we swallow errors so devices without haptic hardware (simulators, older
 * Androids) silently no-op.
 *
 * The enabled flag is cached in-memory and kept in sync with AsyncStorage so
 * per-cue calls (card deal fires 12 times in quick succession) never block on
 * disk. The `useHapticsEnabled` hook is the source of truth for writes.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

export type HapticKind = "light" | "medium" | "heavy" | "success" | "warning";

export const HAPTICS_STORAGE_KEY = "haptics_enabled";

// Cached state. Starts as `true` (default on) and is updated by the hook and
// by `refreshHapticsEnabledCache` on app start. We intentionally fire-and-
// forget without awaiting a disk read — if the user toggled it off last
// session the first handful of cues might still run, which is harmless.
let cachedEnabled = true;

export function setHapticsEnabledCache(next: boolean): void {
  cachedEnabled = next;
}

export async function refreshHapticsEnabledCache(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(HAPTICS_STORAGE_KEY);
    cachedEnabled = raw === null ? true : raw === "true";
  } catch {
    cachedEnabled = true;
  }
  return cachedEnabled;
}

export function triggerHaptic(kind: HapticKind): void {
  if (!cachedEnabled) return;
  try {
    switch (kind) {
      case "light":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      case "medium":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      case "heavy":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        return;
      case "success":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      case "warning":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
    }
  } catch {
    // Older devices / simulators without haptic hardware — silent no-op.
  }
}
