interface TileGlyphProps {
  kind: string;
  size?: number;
  color?: string;
}

export function TileGlyph({ kind, size = 38, color = 'rgba(255,240,210,.85)' }: TileGlyphProps) {
  const c = color;
  const sw = 1.4;
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 40 40',
    fill: 'none',
    stroke: c,
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (kind) {
    case 'sun':
      return (
        <svg {...props}>
          <circle cx="20" cy="20" r="6" fill={c} opacity=".8" />
          {[...Array(8)].map((_, i) => {
            const a = (i * Math.PI) / 4;
            return (
              <line
                key={i}
                x1={20 + 10 * Math.cos(a)}
                y1={20 + 10 * Math.sin(a)}
                x2={20 + 14 * Math.cos(a)}
                y2={20 + 14 * Math.sin(a)}
              />
            );
          })}
        </svg>
      );
    case 'moon':
      return (
        <svg {...props}>
          <path d="M26 12 A10 10 0 1 0 26 28 A8 8 0 1 1 26 12 Z" fill={c} opacity=".8" />
        </svg>
      );
    case 'spiral':
      return (
        <svg {...props}>
          <path d="M20 20 m0 0 a3 3 0 1 0 4 -4 a6 6 0 1 0 -8 8 a9 9 0 1 0 12 -12" />
        </svg>
      );
    case 'leaf':
      return (
        <svg {...props}>
          <path d="M10 30 Q12 14 30 10 Q28 28 10 30 Z" />
          <line x1="10" y1="30" x2="22" y2="18" />
        </svg>
      );
    case 'flame':
      return (
        <svg {...props}>
          <path
            d="M20 8 Q26 16 24 22 Q28 24 26 30 Q22 34 20 32 Q18 34 14 30 Q12 24 16 22 Q14 16 20 8 Z"
            fill={c}
            opacity=".7"
          />
        </svg>
      );
    case 'arch':
      return (
        <svg {...props}>
          <path d="M8 32 L8 22 Q20 6 32 22 L32 32 Z" fill={c} opacity=".25" />
          <path d="M8 32 L8 22 Q20 6 32 22 L32 32" />
        </svg>
      );
    case 'chalice':
      return (
        <svg {...props}>
          <path d="M12 12 L28 12 Q28 22 20 24 Q12 22 12 12 Z" fill={c} opacity=".6" />
          <line x1="20" y1="24" x2="20" y2="30" />
          <line x1="14" y1="32" x2="26" y2="32" />
        </svg>
      );
    case 'wave':
      return (
        <svg {...props}>
          <path d="M6 22 Q12 14 18 22 T30 22 T34 22" />
          <path d="M6 28 Q12 20 18 28 T30 28 T34 28" opacity=".6" />
        </svg>
      );
    case 'gate':
      return (
        <svg {...props}>
          <rect x="10" y="14" width="20" height="20" fill="none" />
          <path d="M10 18 L30 18 M14 14 L14 10 L26 10 L26 14" />
        </svg>
      );
    case 'helipad':
      return (
        <svg {...props}>
          <circle cx="20" cy="20" r="13" fill="none" />
          <path d="M13 13 L13 27 M27 13 L27 27 M13 20 L27 20" />
        </svg>
      );
    case 'bridge':
      return (
        <svg {...props}>
          <path d="M4 22 Q20 8 36 22" />
          <line x1="4" y1="22" x2="4" y2="32" />
          <line x1="36" y1="22" x2="36" y2="32" />
          <line x1="20" y1="15" x2="20" y2="32" />
        </svg>
      );
    case 'cliff':
      return (
        <svg {...props}>
          <path d="M4 32 L4 22 L12 22 L12 14 L22 14 L22 8 L34 8 L34 32 Z" fill={c} opacity=".25" />
          <path d="M4 32 L4 22 L12 22 L12 14 L22 14 L22 8 L34 8" />
        </svg>
      );
    case 'forest':
      return (
        <svg {...props}>
          <path d="M12 28 L8 18 L11 18 L9 12 L15 18 L13 18 L16 28 Z" fill={c} opacity=".6" />
          <path d="M26 30 L22 18 L25 18 L23 10 L30 18 L28 18 L31 30 Z" fill={c} opacity=".6" />
        </svg>
      );
    case 'dunes':
      return (
        <svg {...props}>
          <path d="M4 28 Q12 18 20 24 Q28 30 36 22" />
          <path d="M4 22 Q12 14 20 18 Q28 22 36 16" opacity=".6" />
        </svg>
      );
    case 'lagoon':
      return (
        <svg {...props}>
          <ellipse cx="20" cy="22" rx="14" ry="8" fill={c} opacity=".4" />
          <ellipse cx="20" cy="22" rx="14" ry="8" />
        </svg>
      );
    case 'marsh':
      return (
        <svg {...props}>
          <line x1="8" y1="32" x2="8" y2="20" />
          <line x1="14" y1="32" x2="14" y2="14" />
          <line x1="20" y1="32" x2="20" y2="10" />
          <line x1="26" y1="32" x2="26" y2="16" />
          <line x1="32" y1="32" x2="32" y2="22" />
        </svg>
      );
    case 'star':
      return (
        <svg {...props}>
          <circle cx="20" cy="22" r="10" fill="none" />
          <circle cx="20" cy="22" r="2" fill={c} />
          <circle cx="13" cy="14" r="1" fill={c} />
          <circle cx="28" cy="11" r="1.4" fill={c} />
          <circle cx="30" cy="26" r="1" fill={c} />
        </svg>
      );
    case 'monolith':
      return (
        <svg {...props}>
          <rect x="15" y="6" width="10" height="28" fill={c} opacity=".3" />
          <rect x="15" y="6" width="10" height="28" />
        </svg>
      );
    case 'hollow':
      return (
        <svg {...props}>
          <path d="M8 32 Q8 12 20 12 Q32 12 32 32 Z" fill={c} opacity=".2" />
          <path d="M8 32 Q8 12 20 12 Q32 12 32 32" />
          <circle cx="20" cy="22" r="3" fill={c} opacity=".6" />
        </svg>
      );
    case 'tower':
      return (
        <svg {...props}>
          <rect x="16" y="10" width="8" height="24" />
          <rect x="14" y="8" width="12" height="4" />
          <line x1="20" y1="10" x2="20" y2="6" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="20" cy="20" r="6" />
        </svg>
      );
  }
}
