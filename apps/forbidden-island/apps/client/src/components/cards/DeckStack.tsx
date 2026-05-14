import type { CSSProperties } from 'react';
import { CardBack } from './CardBack';

interface DeckStackProps {
  count?: number;
  width?: number;
  height?: number;
  label?: string;
  sub?: string;
  tone?: 'deck' | 'flood';
  style?: CSSProperties;
}

export function DeckStack({ count = 18, width = 90, height = 130, label = 'Treasure', sub, tone = 'deck', style }: DeckStackProps) {
  const layers = Math.min(5, Math.max(1, Math.round(count / 6)));
  return (
    <div style={{ position: 'relative', width: width + 12, height: height + 10, ...style }}>
      {[...Array(layers)].map((_, i) => (
        <div key={i} style={{ position: 'absolute', top: i * 1.2, left: i * 1.4 }}>
          <CardBack width={width} height={height} label={label} tone={tone === 'flood' ? 'flood' : 'deck'} />
        </div>
      ))}
      <div className="fi-mono" style={{ position: 'absolute', bottom: -18, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: 'var(--c-sand2)' }}>
        {label} - {count} {sub ? `- ${sub}` : ''}
      </div>
    </div>
  );
}
