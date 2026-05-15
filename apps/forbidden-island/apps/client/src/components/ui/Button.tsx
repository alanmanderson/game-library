import type { CSSProperties, ReactNode, MouseEventHandler } from 'react';

type BtnKind = 'primary' | 'ghost' | 'danger' | 'quiet';
type BtnSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  children: ReactNode;
  style?: CSSProperties;
  kind?: BtnKind;
  size?: BtnSize;
  disabled?: boolean;
  glow?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit';
}

const SIZES: Record<BtnSize, CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: 12 },
  md: { padding: '10px 18px', fontSize: 13 },
  lg: { padding: '14px 26px', fontSize: 15 },
};

const KINDS: Record<BtnKind, CSSProperties> = {
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

export function Button({
  children,
  style,
  kind = 'primary',
  size = 'md',
  disabled,
  glow,
  onClick,
  type = 'button',
}: ButtonProps) {
  const kindStyle = KINDS[kind];
  return (
    <button
      type={type}
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
        ...SIZES[size],
        ...kindStyle,
        ...(glow
          ? {
              boxShadow:
                ((kindStyle.boxShadow as string) || '') +
                ', 0 0 0 3px rgba(232,196,122,.35), 0 0 28px rgba(232,196,122,.4)',
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}
