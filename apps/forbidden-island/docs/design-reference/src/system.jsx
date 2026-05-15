// system.jsx — Forbidden Island design system tokens + base primitives
// Single source of truth for color, type, geometry. ThemeProvider exposes
// active palette as CSS custom properties.

// ─── Palettes ────────────────────────────────────────────────────────────
// Each palette is the same role-mapped set. The default is "Deep Ocean"
// (warm sand + brass + ocean teal). Tweaks switch palette wholesale.

const PALETTES = {
  ocean: {
    name: "Deep Ocean",
    // ink scale (board / surfaces)
    ink:   '#08161c',
    ink2:  '#0e2229',
    ink3:  '#143038',
    ink4:  '#1d4048',
    // ocean fill (flooded tiles, water meter)
    sea:   '#1a4d5a',
    sea2:  '#286b7a',
    seaHi: '#3b97a8',
    // sand / parchment scale (paper, tiles)
    parch: '#f0e3c2',
    sand:  '#e8d4a6',
    sand2: '#d6b97a',
    sand3: '#b1925a',
    // brass / gold (chrome, frames, captured treasure)
    brass: '#caa052',
    brassHi:'#e8c47a',
    brassLo:'#8a6b30',
    // ink text on parch
    inkText:'#231a10',
    inkText2:'#5a4a2a',
    // accents
    danger:'#c9523a',
    flame: '#e07140',
    leaf:  '#5e8a3a',
    // role colors (kept distinct across palettes)
    role_explorer:  '#7aa544',
    role_diver:     '#231a10',
    role_engineer:  '#c33e2c',
    role_pilot:     '#3b7cc4',
    role_messenger: '#f3ead4',
    role_navigator: '#e0b342',
  },
  storm: {
    name: "Stormwatch",
    ink:'#0a0d12', ink2:'#11161e', ink3:'#1a212c', ink4:'#252e3c',
    sea:'#23415a', sea2:'#3a5e7e', seaHi:'#5a86ab',
    parch:'#ecdfc1', sand:'#d8c499', sand2:'#b89c64', sand3:'#8d764a',
    brass:'#b88a3a', brassHi:'#d9aa5a', brassLo:'#6e5220',
    inkText:'#0e1218', inkText2:'#3d4654',
    danger:'#d44a3e', flame:'#e07a35', leaf:'#6b8c3a',
    role_explorer:'#7aa544', role_diver:'#0e1218', role_engineer:'#c33e2c',
    role_pilot:'#3b7cc4', role_messenger:'#f3ead4', role_navigator:'#e0b342',
  },
  tropic: {
    name: "Tropic Reef",
    ink:'#04282e', ink2:'#0b3a40', ink3:'#114c54', ink4:'#1b6068',
    sea:'#1c7b87', sea2:'#2ea0ad', seaHi:'#5fc4cf',
    parch:'#fbeed3', sand:'#f7dca8', sand2:'#e4ba74', sand3:'#b88f48',
    brass:'#e0a44a', brassHi:'#f5c878', brassLo:'#8e6020',
    inkText:'#0a1a1c', inkText2:'#3a5258',
    danger:'#e35a3a', flame:'#ee8240', leaf:'#76b94a',
    role_explorer:'#8bc34a', role_diver:'#0a1a1c', role_engineer:'#e04030',
    role_pilot:'#3aa0e4', role_messenger:'#fff4d8', role_navigator:'#f5c440',
  },
  dusk: {
    name: "Dusk Fathoms",
    ink:'#0c0a1a', ink2:'#161227', ink3:'#211a36', ink4:'#2e2447',
    sea:'#3b2f5a', sea2:'#5a487d', seaHi:'#8a72b0',
    parch:'#ecdcc6', sand:'#d8c0a0', sand2:'#b39370', sand3:'#876b48',
    brass:'#c98f54', brassHi:'#e4ad74', brassLo:'#6f4a22',
    inkText:'#16101e', inkText2:'#4a3d54',
    danger:'#d35265', flame:'#dc7048', leaf:'#7a9c52',
    role_explorer:'#9cc060', role_diver:'#16101e', role_engineer:'#d6483e',
    role_pilot:'#5a8ee0', role_messenger:'#f3e6cf', role_navigator:'#e8b550',
  },
};

const PALETTE_KEYS = Object.keys(PALETTES);

function paletteToCSSVars(p) {
  const o = {};
  for (const k in p) if (k !== 'name') o[`--c-${k}`] = p[k];
  return o;
}

function ThemeProvider({ paletteKey = 'ocean', children, style }) {
  const p = PALETTES[paletteKey] || PALETTES.ocean;
  return (
    <div style={{ ...paletteToCSSVars(p), ...style }} data-palette={paletteKey}>
      {children}
    </div>
  );
}

// ─── Typography ──────────────────────────────────────────────────────────
// Display: Spectral (book-weight serif, painterly journal feel)
// UI: Work Sans (clean humanist sans, not Inter)
// Mono: JetBrains Mono (engineer captions, deck counts)

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?' +
  'family=Spectral:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&' +
  'family=Spectral+SC:wght@400;500;600&' +
  'family=Work+Sans:wght@300;400;500;600;700&' +
  'family=JetBrains+Mono:wght@400;500;600&display=swap';

// Inject fonts and core CSS once.
if (typeof document !== 'undefined' && !document.getElementById('fi-base')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONTS_HREF;
  document.head.appendChild(link);

  const s = document.createElement('style');
  s.id = 'fi-base';
  s.textContent = `
    :root{
      --ff-display:'Spectral',Georgia,serif;
      --ff-sc:'Spectral SC','Spectral',serif;
      --ff-ui:'Work Sans',-apple-system,system-ui,sans-serif;
      --ff-mono:'JetBrains Mono',ui-monospace,monospace;
      --r-1:4px; --r-2:8px; --r-3:14px; --r-4:22px;
      --shadow-1:0 1px 0 rgba(255,255,255,.04) inset, 0 1px 2px rgba(0,0,0,.4);
      --shadow-2:0 1px 0 rgba(255,255,255,.05) inset, 0 8px 24px rgba(0,0,0,.45);
      --shadow-3:0 0 0 1px rgba(0,0,0,.4), 0 18px 60px rgba(0,0,0,.55);
    }
    .fi{font-family:var(--ff-ui);color:var(--c-parch);
      -webkit-font-smoothing:antialiased;font-feature-settings:"ss01","kern";letter-spacing:.005em}
    .fi-display{font-family:var(--ff-display);font-weight:400;letter-spacing:-.01em}
    .fi-display-i{font-family:var(--ff-display);font-style:italic;font-weight:400}
    .fi-sc{font-family:var(--ff-sc);letter-spacing:.06em}
    .fi-mono{font-family:var(--ff-mono);letter-spacing:.02em}
    .fi-cap{font-family:var(--ff-mono);font-size:10px;letter-spacing:.16em;
      text-transform:uppercase;color:var(--c-brass);opacity:.8}
    .fi-hr{height:1px;background:linear-gradient(90deg,transparent,var(--c-brass),transparent);
      opacity:.5;border:0;margin:0}
  `;
  document.head.appendChild(s);
}

// ─── Primitives ──────────────────────────────────────────────────────────

// Brass-framed surface — used everywhere a "card" feels appropriate
function Frame({ children, style, padded = true, tone = 'ink2', accent = false }) {
  return (
    <div
      style={{
        background: `var(--c-${tone})`,
        border: '1px solid rgba(202,160,82,.28)',
        boxShadow: accent
          ? '0 0 0 1px var(--c-brass) inset, 0 12px 30px rgba(0,0,0,.5)'
          : 'var(--shadow-2)',
        borderRadius: 'var(--r-3)',
        padding: padded ? 18 : 0,
        position: 'relative',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Painterly parchment surface for cards
function Parch({ children, style, padded = 14 }) {
  return (
    <div
      style={{
        background:
          'radial-gradient(120% 100% at 20% 0%, var(--c-parch) 0%, var(--c-sand) 70%, var(--c-sand2) 100%)',
        color: 'var(--c-inkText)',
        borderRadius: 'var(--r-3)',
        boxShadow:
          '0 0 0 1px var(--c-brassLo) inset, 0 1px 0 rgba(255,255,255,.5) inset, 0 6px 22px rgba(0,0,0,.45)',
        padding: padded,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* subtle paper grain */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2'/><feColorMatrix values='0 0 0 0 0.2  0 0 0 0 0.16  0 0 0 0 0.08  0 0 0 0.10 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.4'/></svg>\")",
          opacity: 0.5,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

// Brass button — primary action
function Btn({ children, style, kind = 'primary', size = 'md', disabled, glow, onClick }) {
  const sizes = {
    sm: { padding: '6px 12px', fontSize: 12 },
    md: { padding: '10px 18px', fontSize: 13 },
    lg: { padding: '14px 26px', fontSize: 15 },
  };
  const kinds = {
    primary: {
      background:
        'linear-gradient(180deg,var(--c-brassHi) 0%,var(--c-brass) 55%,var(--c-brassLo) 100%)',
      color: 'var(--c-ink)',
      border: '1px solid var(--c-brassLo)',
      boxShadow:
        '0 1px 0 rgba(255,255,255,.45) inset, 0 -1px 0 rgba(0,0,0,.2) inset, 0 6px 16px rgba(0,0,0,.4)',
      fontWeight: 600,
    },
    ghost: {
      background: 'transparent',
      color: 'var(--c-parch)',
      border: '1px solid rgba(202,160,82,.4)',
    },
    danger: {
      background:
        'linear-gradient(180deg,#e58a72 0%,var(--c-danger) 60%,#7a2a1c 100%)',
      color: '#fff',
      border: '1px solid #6e2218',
      fontWeight: 600,
    },
    quiet: {
      background: 'rgba(255,255,255,.03)',
      color: 'var(--c-sand)',
      border: '1px solid rgba(202,160,82,.2)',
    },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="fi"
      style={{
        fontFamily: 'var(--ff-ui)',
        fontWeight: 500,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'transform .12s, box-shadow .15s, filter .15s',
        ...sizes[size],
        ...kinds[kind],
        ...(glow
          ? { boxShadow: (kinds[kind].boxShadow || '') + ', 0 0 0 3px rgba(232,196,122,.35), 0 0 28px rgba(232,196,122,.4)' }
          : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// Section heading for design canvas content (within artboards)
function SectionTitle({ kicker, title, sub, style }) {
  return (
    <div style={{ marginBottom: 12, ...style }}>
      {kicker && <div className="fi-cap" style={{ marginBottom: 4 }}>{kicker}</div>}
      <div className="fi-display" style={{ fontSize: 22, color: 'var(--c-parch)' }}>{title}</div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--c-sand2)', marginTop: 4, lineHeight: 1.5 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// Small inline pill / badge
function Pill({ children, tone = 'brass', style }) {
  const tones = {
    brass: { background: 'rgba(202,160,82,.18)', color: 'var(--c-brassHi)', border: '1px solid rgba(202,160,82,.4)' },
    sea:   { background: 'rgba(58,151,168,.15)', color: 'var(--c-seaHi)',  border: '1px solid rgba(58,151,168,.35)' },
    danger:{ background: 'rgba(201,82,58,.18)',  color: '#f0a89a',          border: '1px solid rgba(201,82,58,.5)' },
    sand:  { background: 'rgba(232,212,166,.12)',color: 'var(--c-sand)',    border: '1px solid rgba(232,212,166,.3)' },
  };
  return (
    <span
      className="fi-mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 10,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        fontWeight: 500,
        ...tones[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// Compass-rose icon (used as logo/motif) — simple geometric, OK to draw
function Compass({ size = 64, color = 'currentColor', style }) {
  const r = size / 2;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
      <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="1" opacity=".5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth=".6" opacity=".3" />
      {/* cardinal points */}
      <polygon points="50,4 54,50 50,50" fill={color} />
      <polygon points="50,96 46,50 50,50" fill={color} opacity=".7" />
      <polygon points="50,50 96,50 50,54" fill={color} opacity=".7" />
      <polygon points="50,50 4,50 50,46" fill={color} opacity=".7" />
      {/* diagonals */}
      <polygon points="50,50 78,22 76,24" fill={color} opacity=".4" />
      <polygon points="50,50 22,78 24,76" fill={color} opacity=".4" />
      <polygon points="50,50 78,78 76,76" fill={color} opacity=".4" />
      <polygon points="50,50 22,22 24,24" fill={color} opacity=".4" />
      <circle cx="50" cy="50" r="2.5" fill={color} />
    </svg>
  );
}

// Filigree corner — adds journal flourish to a frame
function CornerFiligree({ size = 22, color = 'currentColor', style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" style={style}>
      <path
        d="M1 1 L1 8 M1 1 L8 1 M1 1 Q9 1 9 9"
        fill="none"
        stroke={color}
        strokeWidth="1"
        opacity=".7"
      />
    </svg>
  );
}

Object.assign(window, {
  PALETTES, PALETTE_KEYS, ThemeProvider, paletteToCSSVars,
  Frame, Parch, Btn, Pill, SectionTitle, Compass, CornerFiligree,
});
