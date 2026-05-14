import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenBg } from '../components/ui/ScreenBg';
import { BrandMark } from '../components/ui/BrandMark';
import { Frame } from '../components/ui/Frame';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { Parch } from '../components/ui/Parch';
import { useStore } from '../store/store';

export function HomeScreen() {
  const navigate = useNavigate();
  const [name, setName] = useState(() => localStorage.getItem('fi-player-name') || '');
  const games = useStore((s) => s.gameList);
  const send = useStore((s) => s.send);
  const rejoinInfo = useStore((s) => s.rejoinInfo);

  useEffect(() => {
    if (name) localStorage.setItem('fi-player-name', name);
  }, [name]);

  const canCreate = name.trim().length >= 1 && name.trim().length <= 20;

  function handleCreate() {
    if (!canCreate) return;
    navigate('/create');
  }

  function handleJoin(gameId: string) {
    if (!canCreate) return;
    send({ type: 'lobby:join', gameId, playerName: name.trim() });
    navigate(`/game/${gameId}/lobby`);
  }

  function handleRejoin() {
    if (!rejoinInfo) return;
    send({ type: 'game:reconnect', gameId: rejoinInfo.gameId, playerId: rejoinInfo.playerId, secret: rejoinInfo.secret });
    navigate(`/game/${rejoinInfo.gameId}`);
  }

  return (
    <ScreenBg>
      <div style={{
        position: 'relative', maxWidth: 1040, margin: '0 auto', padding: '48px 56px',
        height: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56,
      }}>
        {/* LEFT: brand + entry */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <BrandMark size="xl" />
          <div className="fi-display-i" style={{ marginTop: 18, fontSize: 18, color: 'var(--c-sand)', lineHeight: 1.4, maxWidth: 420 }}>
            Four sacred treasures lie scattered across a sinking island. Recover them with your crew --- before the sea claims everything.
          </div>
          <div style={{ height: 30 }} />
          <Frame tone="ink2" padded={false} style={{ padding: '22px 24px' }}>
            <div className="fi-cap" style={{ marginBottom: 8 }}>Your Name</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                placeholder="Mariner..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                className="fi"
                style={{
                  flex: 1, padding: '12px 14px', fontSize: 15,
                  background: 'rgba(8,22,28,.6)', color: 'var(--c-parch)',
                  border: '1px solid var(--c-brassLo)', borderRadius: 8,
                  fontFamily: 'var(--ff-display)', fontStyle: 'italic', outline: 'none',
                }}
              />
              <Button kind="primary" size="lg" glow={canCreate} disabled={!canCreate} onClick={handleCreate}>
                Create Game
              </Button>
            </div>
            <div className="fi-mono" style={{ fontSize: 9.5, color: 'var(--c-sand2)', marginTop: 10, letterSpacing: '.1em' }}>
              1-20 CHARACTERS - STORED LOCALLY
            </div>
          </Frame>
        </div>
        {/* RIGHT: open games */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="fi-cap" style={{ marginBottom: 8 }}>Open Expeditions</div>
          <div className="fi-display" style={{ fontSize: 24, color: 'var(--c-parch)', marginBottom: 14 }}>Join a crew</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {games.map((g) => (
              <div key={g.gameId} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: 'rgba(20,48,56,.55)', borderRadius: 12,
                border: '1px solid rgba(202,160,82,.2)',
                boxShadow: '0 6px 16px rgba(0,0,0,.3)',
              }}>
                <div style={{ flex: 1 }}>
                  <div className="fi-display" style={{ fontSize: 16, color: 'var(--c-parch)' }}>{g.hostName}'s expedition</div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <Pill tone="brass">{g.difficulty}</Pill>
                    <Pill tone="sea">{g.playerCount} / {g.maxPlayers} aboard</Pill>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[...Array(g.maxPlayers)].map((_, i) => (
                    <div key={i} style={{
                      width: 8, height: 24, borderRadius: 2,
                      background: i < g.playerCount ? 'var(--c-brass)' : 'transparent',
                      border: '1px solid rgba(202,160,82,.4)',
                    }} />
                  ))}
                </div>
                <Button size="md" disabled={!canCreate} onClick={() => handleJoin(g.gameId)}>Join</Button>
              </div>
            ))}
            {games.length === 0 && (
              <Parch style={{ padding: 18, textAlign: 'center' }}>
                <div className="fi-display-i" style={{ fontSize: 15, color: 'var(--c-inkText2)' }}>No expeditions afoot. Create one!</div>
              </Parch>
            )}
          </div>
          {/* rejoin banner */}
          {rejoinInfo && (
            <div style={{
              marginTop: 14, padding: '10px 14px', borderRadius: 10,
              border: '1px dashed var(--c-brassHi)', background: 'rgba(232,196,122,.06)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--c-brassHi)', boxShadow: '0 0 8px var(--c-brassHi)', animation: 'fi-pulse 1.6s ease-in-out infinite' }} />
              <div style={{ flex: 1, fontSize: 12, color: 'var(--c-sand)' }}>
                <span className="fi-display-i" style={{ fontSize: 13, color: 'var(--c-brassHi)' }}>You have a voyage in progress.</span> Rejoin?
              </div>
              <Button kind="ghost" size="sm" onClick={handleRejoin}>Rejoin</Button>
            </div>
          )}
        </div>
      </div>
    </ScreenBg>
  );
}
