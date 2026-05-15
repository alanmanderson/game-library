import type { CSSProperties, ReactNode } from 'react';

const PAPER_GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.18'/></svg>\")";

export type CardTone = 'parch' | 'storm' | 'flood' | 'danger' | 'sky';

const TONES: Record<CardTone, string> = {
  parch: 'radial-gradient(120% 100% at 25% 10%, var(--c-parch) 0%, var(--c-sand) 60%, var(--c-sand2) 100%)',
  storm: 'radial-gradient(120% 100% at 25% 10%, #4a5e6e 0%, #1a2e3a 70%, #0c1820 100%)',
  flood: 'radial-gradient(120% 100% at 25% 10%, #2c6a78 0%, #144048 60%, #08222a 100%)',
  danger: 'radial-gradient(120% 100% at 30% 10%, #e58a72 0%, #c9523a 55%, #4a1a10 100%)',
  sky: 'radial-gradient(120% 100% at 25% 10%, #c9deea 0%, #6fa5c4 70%, #2a587a 100%)',
};

interface CardFrameProps {
  children: ReactNode;
  width?: number;
  height?: number;
  style?: CSSProperties;
  tone?: CardTone;
  interactive?: boolean;
  glow?: boolean;
}

export function CardFrame({ children, width = 140, height = 200, style, tone = 'parch', interactive, glow }: CardFrameProps) {
  return (
    <div style={{
      width, height,
      position: 'relative',
      borderRadius: 10,
      background: TONES[tone],
      boxShadow:
        '0 0 0 1px var(--c-brassLo) inset, 0 1px 0 rgba(255,255,255,.4) inset, 0 8px 20px rgba(0,0,0,.45)' +
        (glow ? ', 0 0 0 2px var(--c-brassHi), 0 0 32px rgba(232,196,122,.5)' : ''),
      overflow: 'hidden',
      cursor: interactive ? 'pointer' : 'default',
      transition: 'transform .15s, box-shadow .15s',
      flexShrink: 0,
      ...style,
    }}>
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        backgroundImage: PAPER_GRAIN,
        mixBlendMode: 'overlay', opacity: 0.7, pointerEvents: 'none',
      }} />
      <div style={{ position: 'absolute', inset: 5, borderRadius: 7, border: '1px solid rgba(202,160,82,.45)', pointerEvents: 'none' }} />
      {children}
    </div>
  );
}
