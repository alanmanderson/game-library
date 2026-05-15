import type { CSSProperties, ReactNode } from 'react';

interface FrameProps {
  children: ReactNode;
  style?: CSSProperties;
  padded?: boolean;
  tone?: 'ink2' | 'ink3' | 'ink4';
  accent?: boolean;
}

export function Frame({ children, style, padded = true, tone = 'ink2', accent = false }: FrameProps) {
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
