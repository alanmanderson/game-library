import type { CSSProperties, ReactNode } from 'react';

const PAPER_GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.12'/></svg>\")";

interface ScreenBgProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function ScreenBg({ children, style }: ScreenBgProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: `
          radial-gradient(80% 60% at 30% 10%, rgba(58,151,168,.10) 0%, transparent 60%),
          radial-gradient(60% 50% at 80% 90%, rgba(202,160,82,.08) 0%, transparent 60%),
          linear-gradient(180deg, var(--c-ink) 0%, var(--c-ink2) 100%)`,
        color: 'var(--c-parch)',
        fontFamily: 'var(--ff-ui)',
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: PAPER_GRAIN,
          mixBlendMode: 'overlay',
          opacity: 0.6,
          pointerEvents: 'none',
        }}
      />
      {children}
    </div>
  );
}
