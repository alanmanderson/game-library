import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenBg } from '../components/ui/ScreenBg';
import { BrandMark } from '../components/ui/BrandMark';
import { Frame } from '../components/ui/Frame';
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
  const [soloMode, setSoloMode] = useState(false);
  const [soloPlayerCount, setSoloPlayerCount] = useState(2);
  const send = useStore((s) => s.send);
  const currentLobby = useStore((s) => s.currentLobby);
  const gameState = useStore((s) => s.gameState);
  const [creating, setCreating] = useState(false);

  // Navigate when server responds
  useEffect(() => {
    if (!creating) return;
    // Solo mode: game starts immediately, navigate to game screen
    if (gameState) {
      navigate(`/game/${gameState.id}`);
    }
    // Multiplayer: go to lobby
    else if (currentLobby) {
      navigate(`/game/${currentLobby.gameId}/lobby`);
    }
  }, [creating, currentLobby, gameState, navigate]);

  function handleCreate() {
    const name = localStorage.getItem('fi-player-name') || 'Mariner';
    setCreating(true);
    if (soloMode) {
      send({ type: 'lobby:create_solo', playerName: name, difficulty, playerCount: soloPlayerCount });
    } else {
      send({ type: 'lobby:create', playerName: name, difficulty });
    }
  }

  return (
    <ScreenBg>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '52px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BrandMark size="md" />
          <Button kind="ghost" size="sm" onClick={() => navigate('/')}>Back</Button>
        </div>

        {/* Mode selection */}
        <div>
          <div className="fi-cap" style={{ marginBottom: 8 }}>Game Mode</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {([
              { id: false, label: 'Multiplayer', sub: 'Invite friends to play together' },
              { id: true, label: 'Solo Expedition', sub: 'Control multiple adventurers yourself' },
            ] as const).map((m) => {
              const sel = soloMode === m.id;
              return (
                <div
                  key={String(m.id)}
                  onClick={() => setSoloMode(m.id)}
                  style={{
                    flex: 1, padding: 16, borderRadius: 12, cursor: 'pointer',
                    background: sel
                      ? 'linear-gradient(180deg, rgba(232,196,122,.15), rgba(202,160,82,.04))'
                      : 'rgba(20,48,56,.5)',
                    border: `1px solid ${sel ? 'var(--c-brassHi)' : 'rgba(202,160,82,.2)'}`,
                    boxShadow: sel ? '0 0 0 1px var(--c-brassHi), 0 8px 20px rgba(0,0,0,.35)' : '0 4px 12px rgba(0,0,0,.3)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <div className="fi-display" style={{ fontSize: 20, color: 'var(--c-parch)' }}>{m.label}</div>
                    {sel && <Pill tone="brass">Selected</Pill>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c-sand)', marginTop: 4, lineHeight: 1.4 }}>{m.sub}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Solo player count */}
        {soloMode && (
          <Frame tone="ink2" padded={false} style={{ padding: 16 }}>
            <div className="fi-cap" style={{ marginBottom: 8 }}>How many adventurers?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[2, 3, 4].map((n) => {
                const sel = soloPlayerCount === n;
                return (
                  <button
                    key={n}
                    className="fi"
                    onClick={() => setSoloPlayerCount(n)}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                      background: sel ? 'var(--c-brass)' : 'rgba(20,48,56,.5)',
                      color: sel ? 'var(--c-ink)' : 'var(--c-sand)',
                      border: `1px solid ${sel ? 'var(--c-brassHi)' : 'rgba(202,160,82,.25)'}`,
                      fontWeight: 600, fontSize: 16,
                    }}
                  >
                    <div className="fi-display" style={{ fontSize: 24, color: sel ? 'var(--c-ink)' : 'var(--c-parch)' }}>{n}</div>
                    <div className="fi-mono" style={{ fontSize: 9, letterSpacing: '.1em', marginTop: 4, color: sel ? 'var(--c-ink)' : 'var(--c-sand2)' }}>
                      {n === 2 ? 'TWO' : n === 3 ? 'THREE' : 'FOUR'} ADVENTURERS
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="fi-mono" style={{ fontSize: 9.5, color: 'var(--c-sand2)', marginTop: 8, letterSpacing: '.08em' }}>
              ROLES ASSIGNED RANDOMLY - YOU CONTROL ALL ADVENTURERS
            </div>
          </Frame>
        )}

        {/* Difficulty */}
        <div>
          <div className="fi-cap" style={{ marginBottom: 8 }}>Difficulty</div>
          <div className="fi-display" style={{ fontSize: 28, color: 'var(--c-parch)', marginBottom: 6 }}>Choose your difficulty</div>
          <div style={{ fontSize: 13, color: 'var(--c-sand2)', maxWidth: 520, lineHeight: 1.5 }}>
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
          <div style={{ fontSize: 12, color: 'var(--c-sand2)' }}>Roles are randomly assigned when the game starts.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button kind="ghost" onClick={() => navigate('/')}>Cancel</Button>
            <Button kind="primary" size="lg" glow onClick={handleCreate}>
              {soloMode ? 'Begin Solo Expedition' : 'Create Expedition'}
            </Button>
          </div>
        </div>
      </div>
    </ScreenBg>
  );
}
