import type { CSSProperties } from 'react';

interface CornerFiligreeProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function CornerFiligree({ size = 22, color = 'currentColor', style }: CornerFiligreeProps) {
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
