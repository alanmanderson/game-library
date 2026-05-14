import type { CSSProperties } from 'react';
import { TILES_BY_ID } from '../../data/tiles';
import { TileGlyph } from '../board/TileGlyph';
import { CardFrame } from './CardFrame';

interface FloodCardProps {
  tileId: string;
  width?: number;
  height?: number;
  style?: CSSProperties;
  glow?: boolean;
  sunk?: boolean;
}

export function FloodCard({ tileId, width = 130, height = 180, style, glow, sunk }: FloodCardProps) {
  const t = TILES_BY_ID[tileId];
  if (!t) return null;
  return (
    <CardFrame width={width} height={height} tone="flood" glow={glow} style={style}>
      <div style={{ padding: '12px 10px 8px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', color: '#e6f4f5' }}>
        <div className="fi-cap" style={{ color: '#e6f4f5', marginBottom: 5, opacity: 0.85 }}>FLOOD</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', position: 'relative' }}>
          <div style={{
            position: 'relative', width: Math.round(width * 0.55), height: Math.round(width * 0.55), borderRadius: 8,
            background: `radial-gradient(120% 100% at 30% 20%, ${t.hue1} 0%, ${t.hue2} 100%)`,
            boxShadow: 'inset 0 0 0 1px rgba(202,160,82,.4), inset 0 -8px 14px rgba(0,0,0,.4)', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TileGlyph kind={t.glyph} size={Math.round(width * 0.28)} />
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(58,151,168,.2) 0%, rgba(26,77,90,.7) 100%)', mixBlendMode: 'multiply' }} />
          </div>
        </div>
        <div className="fi-display-i" style={{ fontSize: Math.round(width * 0.095), color: '#fff5e0', marginTop: 5, lineHeight: 1.05 }}>
          {t.name}
        </div>
        {sunk && (
          <div className="fi-mono" style={{ marginTop: 3, fontSize: 9, color: 'var(--c-danger)', letterSpacing: '.15em' }}>SINKS</div>
        )}
      </div>
    </CardFrame>
  );
}
