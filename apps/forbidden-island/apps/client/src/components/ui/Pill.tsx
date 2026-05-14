import type { CSSProperties, ReactNode } from 'react';

type PillTone = 'brass' | 'sea' | 'danger' | 'sand';

interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  style?: CSSProperties;
}

const TONES: Record<PillTone, CSSProperties> = {
  brass: {
    background: 'rgba(202,160,82,.18)',
    color: 'var(--c-brassHi)',
    border: '1px solid rgba(202,160,82,.4)',
  },
  sea: {
    background: 'rgba(58,151,168,.15)',
    color: 'var(--c-seaHi)',
    border: '1px solid rgba(58,151,168,.35)',
  },
  danger: {
    background: 'rgba(201,82,58,.18)',
    color: '#f0a89a',
    border: '1px solid rgba(201,82,58,.5)',
  },
  sand: {
    background: 'rgba(232,212,166,.12)',
    color: 'var(--c-sand)',
    border: '1px solid rgba(232,212,166,.3)',
  },
};

export function Pill({ children, tone = 'brass', style }: PillProps) {
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
        ...TONES[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
