import type { CSSProperties, ReactNode } from 'react';

const PAPER_GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2'/><feColorMatrix values='0 0 0 0 0.2  0 0 0 0 0.16  0 0 0 0 0.08  0 0 0 0.10 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/></svg>\")";

interface ParchProps {
  children: ReactNode;
  style?: CSSProperties;
  padded?: number;
}

export function Parch({ children, style, padded = 14 }: ParchProps) {
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
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: PAPER_GRAIN,
          opacity: 0.5,
          mixBlendMode: 'multiply',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}
