import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { useHapticsEnabled } from "../hooks/useHapticsEnabled";
import { triggerHaptic } from "../haptics";

/**
 * Small on/off pill for haptic feedback. Lives next to the connection dot on
 * `RoomScreen` — mirrors the position of the web `MuteToggle` in the brand
 * header. When the user enables haptics we fire a quick `light` tap so the
 * toggle itself confirms the change; analogous to web's bid-chime-on-unmute.
 */
export function HapticsToggle() {
  const [enabled, setEnabled] = useHapticsEnabled();

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (next) triggerHaptic("light");
  }

  return (
    <TouchableOpacity
      onPress={toggle}
      style={[styles.button, enabled ? styles.buttonOn : styles.buttonOff]}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      accessibilityLabel={
        enabled ? "Disable haptic feedback" : "Enable haptic feedback"
      }
    >
      <Text style={styles.label}>
        {enabled ? "Haptics: On" : "Haptics: Off"}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  buttonOn: {
    backgroundColor: "rgba(76,175,80,0.15)",
    borderColor: "#4caf50",
  },
  buttonOff: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "#666",
  },
  label: {
    color: "#eee",
    fontSize: 11,
    fontWeight: "600",
  },
});
