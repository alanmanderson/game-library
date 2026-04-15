/**
 * Board themes + checker styles for the cosmetics system.
 *
 * Each theme / style maps to a `data-theme` / `data-checker` attribute on
 * `.board-container`. The actual colours live as CSS custom properties
 * in `Board.css` so theme switching is a one-line attribute change.
 *
 * IMPORTANT: adding an entry here requires:
 *   1. Matching CSS rule in `components/styles/Board.css`
 *   2. Matching ID in `backend/app/cosmetics.py` (for server-side validation)
 */

export interface BoardTheme {
  id: string;
  name: string;
  /** Small colour swatch for preview grids (`background` + `accent` dots). */
  swatch: { board: string; pointDark: string; pointLight: string };
}

export interface CheckerStyle {
  id: string;
  name: string;
  /** Small colour swatch: `[whiteFill, blackFill]` for preview circles. */
  swatch: { white: string; black: string };
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: "classic",
    name: "Classic Wood",
    swatch: { board: "#3e6b35", pointDark: "#5c3d2e", pointLight: "#c69c6d" },
  },
  {
    id: "dark-marble",
    name: "Dark Marble",
    swatch: { board: "#1f2430", pointDark: "#2d3547", pointLight: "#6b7a99" },
  },
  {
    id: "green-felt",
    name: "Casino Felt",
    swatch: { board: "#0f5132", pointDark: "#7a1f1f", pointLight: "#e6cfa0" },
  },
];

export const CHECKER_STYLES: CheckerStyle[] = [
  {
    id: "classic",
    name: "Classic",
    swatch: { white: "#f0e6d3", black: "#2b2b2b" },
  },
  {
    id: "marble",
    name: "Marble",
    swatch: { white: "#fdfaf2", black: "#3a3042" },
  },
  {
    id: "metal",
    name: "Brushed Metal",
    swatch: { white: "#d9dde3", black: "#4a5260" },
  },
];

export const DEFAULT_BOARD_THEME = "classic";
export const DEFAULT_CHECKER_STYLE = "classic";

const BOARD_THEME_IDS = new Set(BOARD_THEMES.map((t) => t.id));
const CHECKER_STYLE_IDS = new Set(CHECKER_STYLES.map((s) => s.id));

/** Resolve a (possibly unknown) theme ID to one that is safe to apply. */
export function resolveBoardTheme(id: string | undefined | null): string {
  if (id && BOARD_THEME_IDS.has(id)) return id;
  return DEFAULT_BOARD_THEME;
}

/** Resolve a (possibly unknown) checker style ID to one that is safe to apply. */
export function resolveCheckerStyle(id: string | undefined | null): string {
  if (id && CHECKER_STYLE_IDS.has(id)) return id;
  return DEFAULT_CHECKER_STYLE;
}
