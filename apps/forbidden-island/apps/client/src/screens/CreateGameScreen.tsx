import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenBg } from '../components/ui/ScreenBg';
import { BrandMark } from '../components/ui/BrandMark';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { WaterMeter } from '../components/status/WaterMeter';
import { useStore } from '../store/store';
import type { Difficulty } from '@forbidden-island/shared/types/game';

const OPTS: { id: Difficulty; label: string; water: number; sub: string }[] = [
  { id: 'novice', label: 'Novice', water: 1, sub: 'Relaxed pace, great for learning' },
  { id: 'normal', label: 'Normal', water: 2, sub: 'Standard challenge' },
  { id: 'elite', label: 'Elite', water: 3, sub: 'For experienced players' },
  { id: 'legendary', label: 'Legendary', water: 4, sub: 'Near-impossible odds' },
];

export function CreateGameScreen() {
  const navigate = useNavigate();
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const send = useStore((s) => s.send);

  function handleCreate() {
    const name = localStorage.getItem('fi-player-name') || 'Mariner';
    send({ type: 'lobby:create', playerName: name, difficulty });
  }

  return (
    <ScreenBg>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '52px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BrandMark size="md" />
          <Button kind="ghost" size="sm" onClick={() => navigate('/')}>Back</Button>
        </div>
        <div>
          <div className="fi-cap" style={{ marginBottom: 8 }}>Step 1 of 3</div>
          <div className="fi-display" style={{ fontSize: 34, color: 'var(--c-parch)' }}>Choose your difficulty</div>
          <div style={{ fontSize: 13, color: 'var(--c-sand2)', marginTop: 6, maxWidth: 520, lineHeight: 1.5 }}>
            Difficulty sets the starting water level. Higher levels mean more flood cards per turn --- and far less margin for error.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {OPTS.map((o) => {
            const sel = o.id === difficulty;
            return (
              <div
                key={o.id}
                onClick={() => setDifficulty(o.id)}
                style={{
                  position: 'relative', padding: 18, borderRadius: 14,
                  background: sel
                    ? 'linear-gradient(180deg, rgba(232,196,122,.16), rgba(202,160,82,.04))'
                    : 'rgba(20,48,56,.5)',
                  border: `1px solid ${sel ? 'var(--c-brassHi)' : 'rgba(202,160,82,.2)'}`,
                  boxShadow: sel ? '0 0 0 1px var(--c-brassHi), 0 12px 28px rgba(0,0,0,.4)' : '0 6px 16px rgba(0,0,0,.3)',
                  display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
                }}
              >
                <WaterMeter level={o.water} compact style={{ width: 48 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <div className="fi-display" style={{ fontSize: 22, color: 'var(--c-parch)' }}>{o.label}</div>
                    {sel && <Pill tone="brass">Selected</Pill>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-sand)', marginTop: 4, lineHeight: 1.4 }}>{o.sub}</div>
                  <div className="fi-mono" style={{ marginTop: 8, fontSize: 10, letterSpacing: '.12em', color: 'var(--c-brassLo)' }}>
                    START WATER - {o.water} - DRAW {o.water <= 2 ? 2 : 3} FLOOD/TURN
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--c-sand2)' }}>You'll select your role in the next room.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button kind="ghost" onClick={() => navigate('/')}>Cancel</Button>
            <Button kind="primary" size="lg" glow onClick={handleCreate}>Create Expedition</Button>
          </div>
        </div>
      </div>
    </ScreenBg>
  );
}
