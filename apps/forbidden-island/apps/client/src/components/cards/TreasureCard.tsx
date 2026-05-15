import type { CSSProperties } from 'react';
import { TREASURE_DATA } from '../../data/tiles';
import { CardFrame } from './CardFrame';

interface TreasureCardProps {
  type: string;
  width?: number;
  height?: number;
  glow?: boolean;
  count?: number;
  style?: CSSProperties;
}

// ─── Treasure face ──────────────────────────────────────────────────────
function TreasureGlyphCard({ kind, size, color }: { kind: string; size: number; color: string }) {
  const p = { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: color, strokeWidth: 1.4 };
  switch (kind) {
    case 'stone': return <svg {...p}><polygon points="10,3 17,10 10,17 3,10" fill={color} opacity=".8" /></svg>;
    case 'wind': return <svg {...p}><path d="M3 8 Q10 4 17 8 M3 12 Q10 8 17 12" /></svg>;
    case 'fire': return <svg {...p}><path d="M10 3 Q14 8 12 12 Q15 13 13 17 Q10 18 10 16 Q8 18 7 14 Q9 12 7 9 Q10 7 10 3 Z" fill={color} opacity=".7" /></svg>;
    case 'chalice2': return <svg {...p}><path d="M5 5 L15 5 Q15 10 10 11 L10 15 M6 17 L14 17" /></svg>;
    default: return null;
  }
}

function TreasureCardFace({ treasure, width = 140, height = 200, glow, count, style }: { treasure: string; width: number; height: number; glow?: boolean; count?: number; style?: CSSProperties }) {
  const d = TREASURE_DATA[treasure];
  if (!d) return null;
  return (
    <CardFrame width={width} height={height} glow={glow} style={style}>
      <div style={{ padding: '14px 12px 10px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative' }}>
        <div className="fi-cap" style={{ color: 'var(--c-brassLo)', marginBottom: 6 }}>TREASURE</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%' }}>
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(60% 60% at 50% 50%, ${d.color}66 0%, transparent 70%)` }} />
          <div style={{
            width: Math.round(width * 0.55), height: Math.round(width * 0.55), borderRadius: '50%',
            background: `radial-gradient(circle at 30% 25%, ${d.color} 0%, color-mix(in oklab, ${d.color} 40%, #2a1a08) 100%)`,
            border: '2px solid var(--c-brassLo)',
            boxShadow: `0 0 24px ${d.color}80, inset 0 -8px 14px rgba(0,0,0,.4), inset 0 4px 8px rgba(255,255,255,.2)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
          }}>
            <TreasureGlyphCard kind={d.glyph} size={Math.round(width * 0.3)} color="rgba(255,245,216,.95)" />
          </div>
        </div>
        <div className="fi-display-i" style={{ fontSize: Math.round(width * 0.105), color: 'var(--c-inkText)', lineHeight: 1.1, marginTop: 6 }}>{d.name}</div>
        <div className="fi-mono" style={{ fontSize: 9, color: 'var(--c-inkText2)', marginTop: 4, letterSpacing: '.1em' }}>COLLECT 4 TO CAPTURE</div>
        {count != null && (
          <div style={{ position: 'absolute', top: 8, right: 10, background: 'var(--c-ink)', color: 'var(--c-brassHi)', borderRadius: 10, padding: '1px 6px', fontFamily: 'var(--ff-mono)', fontSize: 10, fontWeight: 600 }}>
            x{count}
          </div>
        )}
      </div>
    </CardFrame>
  );
}

// ─── Helicopter Lift ────────────────────────────────────────────────────
function HelicopterLiftFace({ width = 140, height = 200, glow, style }: { width: number; height: number; glow?: boolean; style?: CSSProperties }) {
  return (
    <CardFrame width={width} height={height} tone="sky" glow={glow} style={style}>
      <div style={{ padding: '14px 12px 10px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div className="fi-cap" style={{ color: 'var(--c-brassLo)', marginBottom: 6 }}>SPECIAL - ANY TIME</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          <svg viewBox="0 0 80 60" width={Math.round(width * 0.7)} height={Math.round(width * 0.5)} style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.3))' }}>
            <ellipse cx="40" cy="38" rx="22" ry="8" fill="#1a2e3a" />
            <rect x="36" y="20" width="3" height="18" fill="#1a2e3a" />
            <line x1="10" y1="20" x2="68" y2="20" stroke="#1a2e3a" strokeWidth="2" />
            <circle cx="40" cy="20" r="2" fill="#1a2e3a" />
            <path d="M58 38 L74 32 L74 36 Z" fill="#1a2e3a" />
            <line x1="22" y1="48" x2="58" y2="48" stroke="#1a2e3a" strokeWidth="2" />
            <line x1="24" y1="44" x2="24" y2="48" stroke="#1a2e3a" strokeWidth="2" />
            <line x1="56" y1="44" x2="56" y2="48" stroke="#1a2e3a" strokeWidth="2" />
            <ellipse cx="30" cy="35" rx="6" ry="3" fill="#caa052" />
          </svg>
        </div>
        <div className="fi-display-i" style={{ fontSize: Math.round(width * 0.115), color: 'var(--c-ink)' }}>Helicopter Lift</div>
        <div style={{ fontSize: Math.round(width * 0.07), color: 'var(--c-inkText)', marginTop: 5, lineHeight: 1.35, padding: '0 6px' }}>
          Move 1+ pawns sharing a tile to any tile.
        </div>
      </div>
    </CardFrame>
  );
}

// ─── Sandbags ───────────────────────────────────────────────────────────
function SandbagsFace({ width = 140, height = 200, glow, style }: { width: number; height: number; glow?: boolean; style?: CSSProperties }) {
  return (
    <CardFrame width={width} height={height} tone="parch" glow={glow} style={style}>
      <div style={{ padding: '14px 12px 10px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div className="fi-cap" style={{ color: 'var(--c-brassLo)', marginBottom: 6 }}>SPECIAL - ANY TIME</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          <svg viewBox="0 0 80 60" width={Math.round(width * 0.7)} height={Math.round(width * 0.5)}>
            <ellipse cx="22" cy="44" rx="14" ry="5" fill="#b1925a" />
            <ellipse cx="40" cy="44" rx="14" ry="5" fill="#b1925a" />
            <ellipse cx="58" cy="44" rx="14" ry="5" fill="#b1925a" />
            <ellipse cx="31" cy="34" rx="14" ry="5" fill="#caa052" />
            <ellipse cx="49" cy="34" rx="14" ry="5" fill="#caa052" />
            <ellipse cx="40" cy="24" rx="14" ry="5" fill="#e3c081" />
            <line x1="22" y1="44" x2="22" y2="40" stroke="#5e421c" strokeWidth="1" />
            <line x1="40" y1="44" x2="40" y2="40" stroke="#5e421c" strokeWidth="1" />
            <line x1="58" y1="44" x2="58" y2="40" stroke="#5e421c" strokeWidth="1" />
            <line x1="40" y1="24" x2="40" y2="20" stroke="#5e421c" strokeWidth="1" />
          </svg>
        </div>
        <div className="fi-display-i" style={{ fontSize: Math.round(width * 0.115), color: 'var(--c-ink)' }}>Sandbags</div>
        <div style={{ fontSize: Math.round(width * 0.07), color: 'var(--c-inkText)', marginTop: 5, lineHeight: 1.35, padding: '0 6px' }}>
          Shore up any flooded tile anywhere on the island.
        </div>
      </div>
    </CardFrame>
  );
}

// ─── Waters Rise! ───────────────────────────────────────────────────────
function WatersRiseFace({ width = 140, height = 200, glow, style }: { width: number; height: number; glow?: boolean; style?: CSSProperties }) {
  return (
    <CardFrame width={width} height={height} tone="danger" glow={glow} style={style}>
      <div style={{ padding: '14px 12px 10px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', color: '#fff5e0' }}>
        <div className="fi-cap" style={{ color: '#fff5e0', marginBottom: 6, opacity: 0.85 }}>HAZARD - RESOLVE IMMEDIATELY</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
          <svg viewBox="0 0 80 60" width={Math.round(width * 0.75)} height={Math.round(width * 0.55)}>
            <path d="M0 50 Q10 36 22 44 T44 44 T66 44 T80 38 L80 60 L0 60 Z" fill="rgba(255,255,255,.18)" />
            <path d="M0 42 Q10 28 22 36 T44 36 T66 36 T80 30 L80 60 L0 60 Z" fill="rgba(255,255,255,.3)" />
            <path d="M0 34 Q10 20 22 28 T44 28 T66 28 T80 22 L80 60 L0 60 Z" fill="rgba(255,255,255,.55)" />
            <polygon points="38,4 42,4 45,18 35,18" fill="#fff5e0" />
            <polygon points="40,4 38,18 42,18" fill="#7a2a1c" />
          </svg>
        </div>
        <div className="fi-display" style={{ fontSize: Math.round(width * 0.135), letterSpacing: '.02em', fontWeight: 500 }}>Waters Rise!</div>
        <div style={{ fontSize: Math.round(width * 0.065), marginTop: 5, lineHeight: 1.35, padding: '0 6px', opacity: 0.92 }}>
          +1 water level. Reshuffle flood discards onto the top of the flood deck.
        </div>
      </div>
    </CardFrame>
  );
}

// ─── Main switchboard ───────────────────────────────────────────────────
export function TreasureCard({ type, width = 140, height = 200, glow, count, style }: TreasureCardProps) {
  if (type === 'helicopter_lift') return <HelicopterLiftFace width={width} height={height} glow={glow} style={style} />;
  if (type === 'sandbags') return <SandbagsFace width={width} height={height} glow={glow} style={style} />;
  if (type === 'waters_rise') return <WatersRiseFace width={width} height={height} glow={glow} style={style} />;
  return <TreasureCardFace treasure={type} width={width} height={height} glow={glow} count={count} style={style} />;
}
