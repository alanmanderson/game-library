import React from "react";
import { Image, View, StyleSheet, type ImageStyle, type ViewStyle } from "react-native";
import { IMAGE_BASE } from "../config";

interface Props {
  card: string;
  width?: number;
  height?: number;
  style?: ImageStyle;
}

export function CardImage({ card, width = 60, height = 84, style }: Props) {
  // WebP: ~4KB vs PNG ~47KB. React Native supports WebP natively on both
  // iOS 14+ and Android. AVIF support across RN image decoders is still
  // inconsistent, so mobile sticks with WebP.
  return (
    <Image
      source={{ uri: `${IMAGE_BASE}/img/${card}.webp` }}
      style={[{ width, height, borderRadius: 4 }, style]}
      resizeMode="contain"
    />
  );
}

interface CardBackProps {
  width?: number;
  height?: number;
  style?: ViewStyle;
}

export function CardBack({ width = 36, height = 50, style }: CardBackProps) {
  return (
    <View
      style={[
        styles.cardBack,
        { width, height },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  cardBack: {
    backgroundColor: "#2962ff",
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
});
