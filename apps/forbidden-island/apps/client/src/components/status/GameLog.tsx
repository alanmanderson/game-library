import type { CSSProperties } from 'react';

interface LogEntry {
  turn?: number;
  text: string;
  tone?: 'danger' | 'good' | 'neutral';
}

interface GameLogProps {
  entries?: LogEntry[];
  style?: CSSProperties;
}

export function GameLog({ entries = [], style }: GameLogProps) {
  return (
    <div style={style}>
      <div className="fi-cap" style={{ marginBottom: 6 }}>Captain's Log</div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 4,
        maxHeight: 200, overflow: 'auto',
        padding: '8px 10px',
        background: 'rgba(8,22,28,.5)',
        borderRadius: 8,
        border: '1px solid rgba(202,160,82,.15)',
        fontSize: 11, lineHeight: 1.4,
      }}>
        {entries.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, opacity: 1 - i * 0.06 }}>
            <span className="fi-mono" style={{ fontSize: 9, color: 'var(--c-brassLo)', flexShrink: 0, marginTop: 2 }}>
              T{e.turn || 1}
            </span>
            <span style={{ color: e.tone === 'danger' ? '#f0a89a' : e.tone === 'good' ? 'var(--c-brassHi)' : 'var(--c-sand)' }}>
              {e.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
