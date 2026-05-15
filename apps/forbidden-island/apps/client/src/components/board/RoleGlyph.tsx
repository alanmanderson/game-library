interface RoleGlyphProps {
  kind: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function RoleGlyph({ kind, size = 22, color = 'currentColor', strokeWidth: sw = 1.4 }: RoleGlyphProps) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth: sw,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'compass':
      return <svg {...p}><circle cx="12" cy="12" r="9" /><polygon points="12,5 14,12 12,19 10,12" fill={color} opacity=".7" /></svg>;
    case 'goggles':
      return <svg {...p}><circle cx="8" cy="12" r="3.4" /><circle cx="16" cy="12" r="3.4" /><path d="M11 12 L13 12 M4 10 Q4 6 8 8 M20 10 Q20 6 16 8" /></svg>;
    case 'gear':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3.4" />
          {[...Array(8)].map((_, i) => {
            const a = (i * Math.PI) / 4;
            return <line key={i} x1={12 + 5 * Math.cos(a)} y1={12 + 5 * Math.sin(a)} x2={12 + 8 * Math.cos(a)} y2={12 + 8 * Math.sin(a)} />;
          })}
        </svg>
      );
    case 'wings':
      return <svg {...p}><path d="M12 14 L4 8 Q8 14 12 14 Z" fill={color} opacity=".7" /><path d="M12 14 L20 8 Q16 14 12 14 Z" fill={color} opacity=".7" /><circle cx="12" cy="15" r="1.6" /></svg>;
    case 'envelope':
      return <svg {...p}><rect x="3" y="7" width="18" height="11" rx="1" /><path d="M3 8 L12 14 L21 8" /></svg>;
    case 'rose':
      return <svg {...p}><polygon points="12,3 14,12 12,21 10,12" fill={color} opacity=".7" /><polygon points="3,12 12,10 21,12 12,14" fill={color} opacity=".7" /></svg>;
    default:
      return <svg {...p}><circle cx="12" cy="12" r="5" /></svg>;
  }
}
