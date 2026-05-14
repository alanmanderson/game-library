// ─── Design tokens (TypeScript mirror of CSS variables) ──────────────
// Exactly matches PALETTES from system.jsx design reference.

export interface Palette {
  name: string;
  ink: string;
  ink2: string;
  ink3: string;
  ink4: string;
  sea: string;
  sea2: string;
  seaHi: string;
  parch: string;
  sand: string;
  sand2: string;
  sand3: string;
  brass: string;
  brassHi: string;
  brassLo: string;
  inkText: string;
  inkText2: string;
  danger: string;
  flame: string;
  leaf: string;
  role_explorer: string;
  role_diver: string;
  role_engineer: string;
  role_pilot: string;
  role_messenger: string;
  role_navigator: string;
}

export const PALETTES: Record<string, Palette> = {
  ocean: {
    name: 'Deep Ocean',
    ink: '#08161c', ink2: '#0e2229', ink3: '#143038', ink4: '#1d4048',
    sea: '#1a4d5a', sea2: '#286b7a', seaHi: '#3b97a8',
    parch: '#f0e3c2', sand: '#e8d4a6', sand2: '#d6b97a', sand3: '#b1925a',
    brass: '#caa052', brassHi: '#e8c47a', brassLo: '#8a6b30',
    inkText: '#231a10', inkText2: '#5a4a2a',
    danger: '#c9523a', flame: '#e07140', leaf: '#5e8a3a',
    role_explorer: '#7aa544', role_diver: '#231a10', role_engineer: '#c33e2c',
    role_pilot: '#3b7cc4', role_messenger: '#f3ead4', role_navigator: '#e0b342',
  },
  storm: {
    name: 'Stormwatch',
    ink: '#0a0d12', ink2: '#11161e', ink3: '#1a212c', ink4: '#252e3c',
    sea: '#23415a', sea2: '#3a5e7e', seaHi: '#5a86ab',
    parch: '#ecdfc1', sand: '#d8c499', sand2: '#b89c64', sand3: '#8d764a',
    brass: '#b88a3a', brassHi: '#d9aa5a', brassLo: '#6e5220',
    inkText: '#0e1218', inkText2: '#3d4654',
    danger: '#d44a3e', flame: '#e07a35', leaf: '#6b8c3a',
    role_explorer: '#7aa544', role_diver: '#0e1218', role_engineer: '#c33e2c',
    role_pilot: '#3b7cc4', role_messenger: '#f3ead4', role_navigator: '#e0b342',
  },
  tropic: {
    name: 'Tropic Reef',
    ink: '#04282e', ink2: '#0b3a40', ink3: '#114c54', ink4: '#1b6068',
    sea: '#1c7b87', sea2: '#2ea0ad', seaHi: '#5fc4cf',
    parch: '#fbeed3', sand: '#f7dca8', sand2: '#e4ba74', sand3: '#b88f48',
    brass: '#e0a44a', brassHi: '#f5c878', brassLo: '#8e6020',
    inkText: '#0a1a1c', inkText2: '#3a5258',
    danger: '#e35a3a', flame: '#ee8240', leaf: '#76b94a',
    role_explorer: '#8bc34a', role_diver: '#0a1a1c', role_engineer: '#e04030',
    role_pilot: '#3aa0e4', role_messenger: '#fff4d8', role_navigator: '#f5c440',
  },
  dusk: {
    name: 'Dusk Fathoms',
    ink: '#0c0a1a', ink2: '#161227', ink3: '#211a36', ink4: '#2e2447',
    sea: '#3b2f5a', sea2: '#5a487d', seaHi: '#8a72b0',
    parch: '#ecdcc6', sand: '#d8c0a0', sand2: '#b39370', sand3: '#876b48',
    brass: '#c98f54', brassHi: '#e4ad74', brassLo: '#6f4a22',
    inkText: '#16101e', inkText2: '#4a3d54',
    danger: '#d35265', flame: '#dc7048', leaf: '#7a9c52',
    role_explorer: '#9cc060', role_diver: '#16101e', role_engineer: '#d6483e',
    role_pilot: '#5a8ee0', role_messenger: '#f3e6cf', role_navigator: '#e8b550',
  },
};

export const PALETTE_KEYS = Object.keys(PALETTES) as Array<keyof typeof PALETTES>;

export type PaletteKey = keyof typeof PALETTES;

// ─── Role color helpers ─────────────────────────────────────────────────
export type RoleId = 'explorer' | 'diver' | 'engineer' | 'pilot' | 'messenger' | 'navigator';

export const ROLE_COLOR_VARS: Record<RoleId, string> = {
  explorer: 'role_explorer',
  diver: 'role_diver',
  engineer: 'role_engineer',
  pilot: 'role_pilot',
  messenger: 'role_messenger',
  navigator: 'role_navigator',
};
