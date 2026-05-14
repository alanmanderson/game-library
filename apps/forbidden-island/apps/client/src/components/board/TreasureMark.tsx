import { TREASURE_DATA } from '../../data/tiles';

function TreasureGlyph({ kind, size, color }: { kind: string; size: number; color: string }) {
  const p = { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: color, strokeWidth: 1.4 };
  switch (kind) {
    case 'stone':
      return <svg {...p}><polygon points="10,3 17,10 10,17 3,10" fill={color} opacity=".8" /></svg>;
    case 'wind':
      return <svg {...p}><path d="M3 8 Q10 4 17 8 M3 12 Q10 8 17 12" /></svg>;
    case 'fire':
      return <svg {...p}><path d="M10 3 Q14 8 12 12 Q15 13 13 17 Q10 18 10 16 Q8 18 7 14 Q9 12 7 9 Q10 7 10 3 Z" fill={color} opacity=".7" /></svg>;
    case 'chalice2':
      return <svg {...p}><path d="M5 5 L15 5 Q15 10 10 11 L10 15 M6 17 L14 17" /></svg>;
    default:
      return null;
  }
}

interface TreasureMarkProps {
  treasure: string;
  captured?: boolean;
  size?: number;
}

export function TreasureMark({ treasure, captured, size = 22 }: TreasureMarkProps) {
  const d = TREASURE_DATA[treasure];
  if (!d) return null;
  return (
    <div
      title={d.name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: captured
          ? `radial-gradient(circle at 35% 35%, ${d.color} 0%, var(--c-brassLo) 100%)`
          : 'rgba(8,22,28,.6)',
        border: `1px solid ${captured ? '#fff5d8' : d.color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: captured ? `0 0 12px ${d.color}88` : 'none',
        flexShrink: 0,
      }}
    >
      <TreasureGlyph kind={d.glyph} size={Math.round(size * 0.6)} color={captured ? 'var(--c-ink)' : d.color} />
    </div>
  );
}
