import React from "react";
import { View, Text, StyleSheet } from "react-native";

const PALETTE = [
  "#e53935", "#8e24aa", "#3949ab", "#00897b",
  "#43a047", "#f4511e", "#6d4c41", "#546e7a",
];

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

interface Props {
  username: string;
}

export function PlayerAvatar({ username }: Props) {
  const color = PALETTE[hashCode(username) % PALETTE.length];
  const initial = username.charAt(0).toUpperCase();

  return (
    <View style={styles.wrapper}>
      <View style={[styles.circle, { backgroundColor: color }]}>
        <Text style={styles.initial}>{initial}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {username}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    gap: 2,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  initial: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  name: {
    color: "#aaa",
    fontSize: 11,
    maxWidth: 70,
    textAlign: "center",
  },
});
