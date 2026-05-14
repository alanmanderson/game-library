interface ActionGlyphProps {
  kind: string;
  size?: number;
  color?: string;
}

export function ActionGlyph({ kind, size = 24, color = 'currentColor' }: ActionGlyphProps) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth: 1.6,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'move':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 4 L12 8 M12 16 L12 20 M4 12 L8 12 M16 12 L20 12" />
          <path d="M12 4 L10 6 M12 4 L14 6 M12 20 L10 18 M12 20 L14 18 M4 12 L6 10 M4 12 L6 14 M20 12 L18 10 M20 12 L18 14" />
        </svg>
      );
    case 'shore':
      return (
        <svg {...p}>
          <path d="M3 17 L21 17" />
          <path d="M3 13 Q9 9 12 13 T21 13" />
          <path d="M7 10 L7 6 M11 8 L11 4 M15 10 L15 6" />
        </svg>
      );
    case 'give':
      return (
        <svg {...p}>
          <rect x="3" y="7" width="11" height="14" rx="1" />
          <rect x="10" y="3" width="11" height="14" rx="1" />
        </svg>
      );
    case 'capt':
      return (
        <svg {...p}>
          <path d="M7 4 L17 4 L17 9 Q17 14 12 14 Q7 14 7 9 Z" />
          <path d="M12 14 L12 18 M8 20 L16 20" />
          <path d="M7 5 L4 5 Q4 9 7 9 M17 5 L20 5 Q20 9 17 9" />
        </svg>
      );
    case 'end':
      return (
        <svg {...p}>
          <polygon points="6,4 18,12 6,20" fill={color} opacity=".7" />
        </svg>
      );
    default:
      return null;
  }
}
