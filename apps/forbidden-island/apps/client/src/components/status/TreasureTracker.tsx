import type { CSSProperties } from 'react';
import { TREASURE_DATA } from '../../data/tiles';
import { TreasureMark } from '../board/TreasureMark';

interface TreasureTrackerProps {
  captured?: string[];
  style?: CSSProperties;
  layout?: 'row' | 'column';
}

export function TreasureTracker({ captured = [], style, layout = 'row' }: TreasureTrackerProps) {
  const list = Object.keys(TREASURE_DATA);
  return (
    <div style={style}>
      <div className="fi-cap" style={{ marginBottom: 8 }}>Treasures Captured</div>
      <div style={{ display: 'flex', gap: 10, flexDirection: layout === 'row' ? 'row' : 'column' }}>
        {list.map((t) => {
          const d = TREASURE_DATA[t];
          const got = captured.includes(t);
          return (
            <div key={t} style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 8,
              background: got ? 'rgba(202,160,82,.12)' : 'rgba(8,22,28,.45)',
              border: `1px solid ${got ? 'var(--c-brass)' : 'rgba(202,160,82,.18)'}`,
              boxShadow: got ? '0 0 14px rgba(232,196,122,.25)' : 'none',
            }}>
              <TreasureMark treasure={t} captured={got} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="fi-display-i" style={{ fontSize: 12, color: got ? 'var(--c-brassHi)' : 'var(--c-sand2)', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                <div className="fi-mono" style={{ fontSize: 8.5, color: got ? 'var(--c-brass)' : 'rgba(232,212,166,.4)', letterSpacing: '.12em', textTransform: 'uppercase' }}>
                  {got ? 'Captured' : 'Uncaptured'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
