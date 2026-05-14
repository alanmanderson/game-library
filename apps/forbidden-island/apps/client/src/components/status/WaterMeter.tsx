import type { CSSProperties } from 'react';

const WATER_LEVELS = [
  { lv: 1, draw: 2, label: 'Novice' },
  { lv: 2, draw: 2, label: 'Normal' },
  { lv: 3, draw: 3, label: 'Elite' },
  { lv: 4, draw: 3, label: 'Legendary' },
  { lv: 5, draw: 4 },
  { lv: 6, draw: 4 },
  { lv: 7, draw: 5 },
  { lv: 8, draw: 5 },
  { lv: 9, draw: 'X' as const, skull: true },
] as const;

interface WaterMeterProps {
  level?: number;
  compact?: boolean;
  style?: CSSProperties;
}

export function WaterMeter({ level = 2, compact, style }: WaterMeterProps) {
  const w = compact ? 54 : 74;
  const h = compact ? 230 : 300;
  const skull = level >= 9;
  const cur = WATER_LEVELS[Math.min(level, 9) - 1];

  return (
    <div style={{ width: w, ...style }}>
      <div className="fi-cap" style={{ marginBottom: 6, textAlign: 'center' }}>Water Level</div>
      <div style={{
        position: 'relative', width: w, height: h,
        background: 'linear-gradient(180deg, #08161c 0%, #143038 100%)',
        border: '1px solid var(--c-brassLo)',
        borderRadius: 10,
        boxShadow: '0 1px 0 rgba(255,255,255,.05) inset, 0 8px 22px rgba(0,0,0,.5)',
        padding: 6, overflow: 'hidden',
      }}>
        {/* water fill */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: `${(level / 9) * 100}%`,
          background: `linear-gradient(180deg, ${skull ? 'var(--c-danger)' : 'var(--c-sea2)'} 0%, ${skull ? '#7a2a1c' : 'var(--c-sea)'} 100%)`,
          transition: 'height .35s cubic-bezier(.4,1.6,.5,1), background .3s',
        }}>
          <svg viewBox="0 0 100 10" preserveAspectRatio="none" style={{ position: 'absolute', top: -6, left: 0, width: '100%', height: 8 }}>
            <path d="M0 5 Q12 0 25 5 T50 5 T75 5 T100 5 L100 10 L0 10 Z" fill={skull ? 'var(--c-danger)' : 'var(--c-sea2)'} />
          </svg>
        </div>
        {/* level marks */}
        <div style={{ position: 'absolute', inset: 8, display: 'flex', flexDirection: 'column-reverse', justifyContent: 'space-between', alignItems: 'stretch' }}>
          {WATER_LEVELS.map((s) => {
            const isCur = s.lv === level;
            return (
              <div key={s.lv} style={{ display: 'flex', alignItems: 'center', gap: 8, height: (h - 16) / 9 }}>
                <div style={{
                  flex: '0 0 auto',
                  width: 8, height: 1.2,
                  background: ('skull' in s && s.skull) ? 'var(--c-danger)' : 'var(--c-brass)',
                  opacity: ('skull' in s && s.skull) ? 1 : 0.7,
                }} />
                <div className="fi-mono" style={{
                  flex: '1 1 auto', fontSize: 9,
                  color: isCur ? 'var(--c-brassHi)' : (('skull' in s && s.skull) ? 'var(--c-danger)' : 'rgba(232,212,166,.6)'),
                  fontWeight: isCur ? 700 : 500, letterSpacing: '.1em', textAlign: 'right', paddingRight: 4,
                }}>
                  {('skull' in s && s.skull) ? 'SKULL' : `${s.lv} - DRAW ${s.draw}`}
                  {'label' in s && s.label && <div style={{ fontSize: 8, opacity: 0.6, lineHeight: 1 }}>{s.label}</div>}
                </div>
              </div>
            );
          })}
        </div>
        {/* current marker */}
        <div style={{
          position: 'absolute', left: -3, right: -3,
          bottom: `calc(${(level / 9) * 100}% - 2px)`,
          height: 4, background: 'var(--c-brassHi)',
          boxShadow: '0 0 12px var(--c-brassHi)',
          transition: 'bottom .35s cubic-bezier(.4,1.6,.5,1)',
        }} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 6 }}>
        <div className="fi-display" style={{ fontSize: 18, color: skull ? 'var(--c-danger)' : 'var(--c-brassHi)' }}>
          {skull ? 'Drowned' : `Draw ${cur.draw}`}
        </div>
        <div className="fi-mono" style={{ fontSize: 9, color: 'var(--c-sand2)' }}>flood cards / turn</div>
      </div>
    </div>
  );
}
