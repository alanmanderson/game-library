import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { confettiPalette, colors } from "@pinochle/shared";
import type { MoonOutcome } from "@pinochle/shared";

interface Props {
  outcome: Extract<MoonOutcome, { kind: "success" } | { kind: "fail" }>;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4000;
const PARTICLE_COUNT = 60; // Conservative count — RN Animated cannot match canvas perf.
const FALL_DURATION_MS = 3200;

interface Particle {
  startX: number;
  delay: number;
  rotation: string;
  color: string;
  size: number;
  drift: number;
  anim: Animated.Value;
}

/**
 * Mobile moon-shot celebration — best-effort RN port of the web version.
 *
 * Uses RN `Animated` with a fixed pool of 60 small colored squares falling
 * from above the screen. Native driver is enabled (transform + opacity only)
 * so the JS thread stays free. When AccessibilityInfo reports reduce-motion,
 * we skip the particles entirely and show only the banner (no fade-in).
 *
 * Sound is intentionally NOT wired here — see TODO in the web component;
 * issue #1 covers the audio system.
 */
export function MoonCelebration({ outcome, onDismiss }: Props) {
  const isSuccess = outcome.kind === "success";
  const [reduced, setReduced] = useState(false);
  const { width, height } = Dimensions.get("window");

  // RN exposes reduce-motion preference asynchronously.
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReduced(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (v) => setReduced(v),
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Build particles once per mount. Same pattern as the web canvas — random
  // start positions across the top, drift left/right as they fall.
  const particlesRef = useRef<Particle[] | null>(null);
  if (!particlesRef.current && isSuccess) {
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
      startX: Math.random() * width,
      delay: Math.random() * 600,
      rotation: `${Math.floor(Math.random() * 360)}deg`,
      color:
        confettiPalette[Math.floor(Math.random() * confettiPalette.length)] ??
        "#fff",
      size: 6 + Math.random() * 6,
      drift: (Math.random() - 0.5) * 80,
      anim: new Animated.Value(0),
    }));
  }

  useEffect(() => {
    if (!isSuccess || reduced) return;
    const ps = particlesRef.current ?? [];
    const animations = ps.map((p) =>
      Animated.timing(p.anim, {
        toValue: 1,
        duration: FALL_DURATION_MS,
        delay: p.delay,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    );
    Animated.parallel(animations).start();
  }, [isSuccess, reduced]);

  // TODO(mobile): sound — web ships a procedural moon-chime cue (see
  // web/src/audio/sounds.ts) but mobile has no audio dep yet. When
  // expo-av (or the new expo-audio) lands, mirror the isSuccess effect
  // from web/src/game/MoonCelebration.tsx.

  useEffect(() => {
    const id = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel="Dismiss moon celebration"
    >
      <View style={styles.overlay}>
        {isSuccess && !reduced && particlesRef.current && (
          <View
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          >
            {particlesRef.current.map((p, i) => {
              const translateY = p.anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-30, height + 30],
              });
              const translateX = p.anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, p.drift],
              });
              return (
                <Animated.View
                  key={i}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: p.startX,
                    width: p.size,
                    height: p.size,
                    backgroundColor: p.color,
                    transform: [
                      { translateX },
                      { translateY },
                      { rotate: p.rotation },
                    ],
                  }}
                />
              );
            })}
          </View>
        )}
        <View
          style={[
            styles.banner,
            isSuccess ? styles.bannerSuccess : styles.bannerFail,
          ]}
        >
          <Text style={styles.team}>Team {outcome.team}</Text>
          <Text style={isSuccess ? styles.title : styles.titleFail}>
            {isSuccess ? "\uD83C\uDF19 SHOT THE MOON!" : "Moon Shot Failed"}
          </Text>
          <Text style={styles.dismiss}>Tap to dismiss</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(58, 42, 31, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    minWidth: 260,
  },
  bannerSuccess: {
    borderColor: colors.accent,
  },
  bannerFail: {
    borderColor: colors.warning,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  team: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },
  title: {
    color: colors.secondary,
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  titleFail: {
    color: colors.warning,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  dismiss: {
    marginTop: 12,
    color: colors.textMuted,
    fontSize: 12,
  },
});
