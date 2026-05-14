import type { CSSProperties } from 'react';
import { Compass } from '../ui/Compass';

interface CardBackProps {
  width?: number;
  height?: number;
  label?: string;
  style?: CSSProperties;
  tone?: 'deck' | 'flood';
}

export function CardBack({ width = 140, height = 200, label = 'Treasure Deck', style, tone = 'deck' }: CardBackProps) {
  const bg = tone === 'flood'
    ? 'radial-gradient(120% 120% at 50% 0%, #1c5868 0%, #0c2e38 80%)'
    : 'radial-gradient(120% 120% at 50% 0%, #1d4048 0%, #08161c 80%)';
  return (
    <div style={{
      width, height, borderRadius: 10,
      background: bg,
      border: '1px solid var(--c-brassLo)',
      boxShadow: '0 0 0 1px rgba(202,160,82,.3) inset, 0 8px 20px rgba(0,0,0,.45)',
      position: 'relative', overflow: 'hidden',
      flexShrink: 0,
      ...style,
    }}>
      <div style={{ position: 'absolute', inset: 6, border: '1px solid rgba(202,160,82,.35)', borderRadius: 7 }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Compass size={Math.round(width * 0.45)} color="var(--c-brass)" style={{ opacity: 0.85 }} />
        <div className="fi-sc" style={{ fontSize: 10, color: 'var(--c-brassHi)', letterSpacing: '.18em' }}>{label}</div>
      </div>
    </div>
  );
}
