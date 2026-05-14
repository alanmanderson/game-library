import type { CSSProperties } from 'react';
import { ROLES_BY_ID } from '../../data/roles';
import { RoleGlyph } from './RoleGlyph';

export type PawnKind = 'portrait' | 'chess' | 'badge' | 'gem';

interface PlayerPawnProps {
  role: string;
  kind?: PawnKind;
  size?: number;
  isActive?: boolean;
  dim?: boolean;
  style?: CSSProperties;
}

export function PlayerPawn({ role, kind = 'portrait', size = 30, isActive, dim, style }: PlayerPawnProps) {
  const r = ROLES_BY_ID[role];
  if (!r) return null;
  const color = `var(--c-${r.colorVar})`;
  const contrast =
    role === 'diver' ? 'var(--c-parch)' :
    role === 'messenger' ? 'var(--c-inkText)' :
    '#fff';

  const halo: CSSProperties = isActive
    ? { boxShadow: `0 0 0 2px var(--c-brassHi), 0 0 18px ${color}`, animation: 'fi-pulse 1.6s ease-in-out infinite' }
    : {};

  const dimFilter = dim ? 'saturate(.3) brightness(.6)' : 'none';

  if (kind === 'badge') {
    return (
      <div style={{
        width: size, height: size, borderRadius: 6, background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(0,0,0,.35)',
        boxShadow: '0 1px 0 rgba(255,255,255,.25) inset, 0 4px 10px rgba(0,0,0,.45)',
        filter: dimFilter, ...halo, ...style,
      }}>
        <RoleGlyph kind={r.glyph} size={Math.round(size * 0.6)} color={contrast} />
      </div>
    );
  }

  if (kind === 'chess') {
    return (
      <div style={{ position: 'relative', width: size, height: size, filter: dimFilter, ...style }}>
        <div style={{
          position: 'absolute', inset: '10% 18% 18% 18%', borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, ${color} 0%, ${color} 50%, rgba(0,0,0,.6) 100%)`,
          border: '1px solid rgba(0,0,0,.55)',
          boxShadow: '0 6px 10px rgba(0,0,0,.45)',
          ...halo,
        }} />
        <div style={{
          position: 'absolute', left: '12%', right: '12%', bottom: '4%', height: '18%',
          borderRadius: '50%', background: 'rgba(0,0,0,.45)', filter: 'blur(2px)',
        }} />
      </div>
    );
  }

  if (kind === 'gem') {
    return (
      <div style={{ position: 'relative', width: size, height: size, filter: dimFilter, ...style }}>
        <svg viewBox="0 0 40 40" width={size} height={size}>
          <polygon points="20,4 36,16 28,36 12,36 4,16" fill={color} stroke="rgba(0,0,0,.5)" strokeWidth="1" />
          <polygon points="20,4 36,16 20,18 4,16" fill="rgba(255,255,255,.25)" />
          <polygon points="20,18 28,36 12,36" fill="rgba(0,0,0,.25)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RoleGlyph kind={r.glyph} size={Math.round(size * 0.4)} color={contrast} />
        </div>
        {isActive && (
          <div style={{
            position: 'absolute', inset: -4, borderRadius: '50%',
            boxShadow: `0 0 0 2px var(--c-brassHi), 0 0 18px ${color}`,
            animation: 'fi-pulse 1.6s ease-in-out infinite',
          }} />
        )}
      </div>
    );
  }

  // portrait (default)
  return (
    <div style={{
      position: 'relative', width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(180deg, var(--c-brassHi) 0%, var(--c-brass) 50%, var(--c-brassLo) 100%)',
      padding: 2,
      boxShadow: '0 1px 0 rgba(255,255,255,.4) inset, 0 4px 10px rgba(0,0,0,.5)',
      filter: dimFilter,
      flexShrink: 0,
      ...halo, ...style,
    }}>
      <div style={{
        width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', position: 'relative',
        background: `radial-gradient(120% 100% at 40% 25%, ${color} 0%, color-mix(in oklab, ${color} 40%, var(--c-ink)) 100%)`,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.5), inset 0 -8px 14px rgba(0,0,0,.45)',
      }}>
        <svg viewBox="0 0 40 40" width="100%" height="100%">
          <circle cx="20" cy="15" r="6" fill="rgba(0,0,0,.35)" />
          <path d="M6 38 Q6 24 20 24 Q34 24 34 38 Z" fill="rgba(0,0,0,.4)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '52%' }}>
          <RoleGlyph kind={r.glyph} size={Math.round(size * 0.28)} color={contrast} strokeWidth={1.6} />
        </div>
      </div>
    </div>
  );
}
