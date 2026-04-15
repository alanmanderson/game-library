// Branding tokens for Pinochle.
//
// These values are the single source of truth for colors, typography, radii,
// shadows, and spacing. The web client mirrors them as CSS custom properties
// on :root in `web/src/index.css`; React Native (mobile) consumes the object
// directly via `StyleSheet.create(...)`.
//
// Keep the two in sync. If you change a value here, update the matching CSS
// variable in `web/src/index.css`.

export const colors = {
  // Brand / action
  primary: "#0E5C3A",
  primaryHover: "#0B7A48",
  primaryActive: "#083F28",
  secondary: "#3A2A1F",
  accent: "#C9871F",
  accentSoft: "#F5E2B8",

  // Surfaces & text
  background: "#FAF6EF",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFDF7",
  textPrimary: "#1B1A17",
  textMuted: "#6B665E",
  border: "#E4DDD0",

  // Status
  success: "#1F7A3A",
  warning: "#B7791F",
  error: "#B3261E",

  // Table / cards
  felt: "#0F4A2E",
  feltRim: "#5C3A1E",
  cardBack: "#7A1F2B",

  // Suits (colorblind-safe)
  suitSpade: "#1B1A17",
  suitClub: "#0E5C3A",
  suitHeart: "#B3261E",
  suitDiamond: "#1E5FB3",
} as const;

export const confettiPalette = [
  "#C9871F",
  "#0E5C3A",
  "#7A1F2B",
  "#F5E2B8",
  "#FFFFFF",
] as const;

export const fonts = {
  display: '"Fraunces", "Georgia", serif',
  body: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

export const fontSizes = {
  h1: "2.25rem",
  h2: "1.75rem",
  h3: "1.25rem",
  body: "1rem",
  small: "0.875rem",
  micro: "0.75rem",
} as const;

export const lineHeights = {
  display: 1.25,
  body: 1.5,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 14,
} as const;

export const shadows = {
  card: "0 1px 2px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.06)",
  elevated: "0 8px 24px rgba(0,0,0,.18)",
} as const;

// Spacing scale — 4/8/12/16/24/32/48/64 px.
// Indexed 1..8 to match the CSS custom properties --space-1 .. --space-8.
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
} as const;

export const tokens = {
  colors,
  confettiPalette,
  fonts,
  fontSizes,
  lineHeights,
  radii,
  shadows,
  space,
} as const;

export type Tokens = typeof tokens;
