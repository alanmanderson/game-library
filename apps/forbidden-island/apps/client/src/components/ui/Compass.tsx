import type { CSSProperties } from 'react';

interface CompassProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function Compass({ size = 64, color = 'currentColor', style }: CompassProps) {
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
