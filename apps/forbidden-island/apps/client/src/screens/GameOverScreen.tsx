import { useNavigate } from 'react-router-dom';
import { ScreenBg } from '../components/ui/ScreenBg';
import { Button } from '../components/ui/Button';
import { Parch } from '../components/ui/Parch';
import { CornerFiligree } from '../components/ui/CornerFiligree';
import { PlayerPawn } from '../components/board/PlayerPawn';
import { TreasureMark } from '../components/board/TreasureMark';
import { WaterMeter } from '../components/status/WaterMeter';
import { TREASURE_DATA } from '../data/tiles';
import { useStore } from '../store/store';

// ─── Loss reasons ───────────────────────────────────────────────────────
const LOSS_REASONS: Record<string, { title: string; sub: string; detail: string }> = {
  fools_landing_sunk: {
    title: "Fools' Landing has sunk.",
    sub: 'There is no escape from a drowned heliport.',
    detail: 'The helicopter pad fell beneath the waves. Without it, no expedition leaves Forbidden Island.',
  },
  both_treasure_tiles_sunk: {
    title: 'A treasure has been lost.',
    sub: 'Both temples have sunk before its capture.',
    detail: 'The matching pair of treasure tiles now lie beneath the sea. The treasure cannot be retrieved.',
  },
  player_drowned: {
    title: 'A crew member has drowned.',
    sub: 'Nowhere left to swim.',
    detail: 'When their tile sank, no adjacent land remained for them to reach.',
  },
  water_meter_max: {
    title: 'The sea has consumed the island.',
    sub: 'Water level has reached the skull.',
    detail: 'After too many Waters Rise! cards, the gauge filled. Nothing now stands above the tide.',
  },
};

// ─── Stat helper ────────────────────────────────────────────────────────
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="fi-mono" style={{ fontSize: 9.5, letterSpacing: '.16em', color: 'var(--c-sand2)' }}>{label.toUpperCase()}</div>
      <div className="fi-display" style={{ fontSize: 22, color: 'var(--c-parch)', marginTop: 3 }}>{value}</div>
    </div>
  );
}

export function GameOverScreen() {
  const navigate = useNavigate();
  const gameState = useStore((s) => s.gameState);
  const isWin = gameState?.phase === 'won';
  const lossReason = gameState?.lossReason || 'water_meter_max';
  const tone = isWin ? 'victory' : 'defeat';
  const ringColor = isWin ? 'var(--c-brassHi)' : 'var(--c-danger)';

  const players = gameState?.players || [];
  const captured = gameState?.capturedTreasures || [];
  const tilesRemaining = gameState?.tiles.filter((t: { state: string }) => t.state !== 'sunk').length || 0;
  const totalTiles = gameState?.tiles.length || 24;

  const bgGrad = isWin
    ? `radial-gradient(80% 60% at 50% 20%, rgba(232,196,122,.22) 0%, transparent 60%),
       radial-gradient(60% 50% at 50% 90%, rgba(58,151,168,.16) 0%, transparent 70%),
       linear-gradient(180deg, var(--c-ink) 0%, var(--c-ink2) 100%)`
    : `radial-gradient(70% 50% at 50% 30%, rgba(201,82,58,.16) 0%, transparent 70%),
       linear-gradient(180deg, var(--c-ink) 0%, #1a0c0a 100%)`;

  const r = LOSS_REASONS[lossReason];

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      color: 'var(--c-parch)', fontFamily: 'var(--ff-ui)', background: bgGrad,
    }}>
      {/* paper grain */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.15'/></svg>\")",
        mixBlendMode: 'overlay', opacity: 0.6,
      }} />
      {/* gilt frame */}
      <div style={{ position: 'absolute', inset: 24, border: `1px solid ${ringColor}`, borderRadius: 14, pointerEvents: 'none', boxShadow: `0 0 60px ${ringColor}33 inset` }} />
      {/* corner filigrees */}
      <div style={{ position: 'absolute', top: 18, left: 30 }}><CornerFiligree size={28} color={ringColor} /></div>
      <div style={{ position: 'absolute', top: 18, right: 30, transform: 'scaleX(-1)' }}><CornerFiligree size={28} color={ringColor} /></div>
      <div style={{ position: 'absolute', bottom: 18, left: 30, transform: 'scaleY(-1)' }}><CornerFiligree size={28} color={ringColor} /></div>
      <div style={{ position: 'absolute', bottom: 18, right: 30, transform: 'scale(-1)' }}><CornerFiligree size={28} color={ringColor} /></div>

      <div style={{ position: 'relative', height: '100%', display: 'grid', gridTemplateRows: 'auto 1fr auto', padding: '60px 80px 40px' }}>
        {/* hero */}
        <div style={{ textAlign: 'center' }}>
          <div className="fi-mono" style={{ fontSize: 11, letterSpacing: '.4em', color: isWin ? 'var(--c-brass)' : 'var(--c-danger)' }}>
            {isWin ? 'EXPEDITION CONCLUDED' : 'EXPEDITION LOST'}
          </div>
          <div className="fi-display" style={{ fontSize: 72, marginTop: 14, color: 'var(--c-parch)', letterSpacing: '-.01em', lineHeight: 1 }}>
            {isWin ? (
              <>You <span className="fi-display-i" style={{ color: 'var(--c-brassHi)' }}>escaped</span>.</>
            ) : (
              <span className="fi-display-i" style={{ color: '#f0a89a' }}>Defeat.</span>
            )}
          </div>
          {isWin && (
            <div className="fi-display-i" style={{ fontSize: 18, marginTop: 8, color: 'var(--c-sand)' }}>The sea closes over what remains.</div>
          )}
          {!isWin && r && (
            <div className="fi-display-i" style={{ fontSize: 20, marginTop: 10, color: 'var(--c-sand)' }}>{r.title}</div>
          )}
        </div>

        {/* center content */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isWin ? (
            <div style={{ display: 'flex', gap: 16 }}>
              {Object.keys(TREASURE_DATA).map((t) => (
                <div key={t} style={{ textAlign: 'center' }}>
                  <TreasureMark treasure={t} captured size={56} />
                  <div className="fi-display-i" style={{ fontSize: 13, color: 'var(--c-brassHi)', marginTop: 6, letterSpacing: '.02em' }}>{TREASURE_DATA[t].name}</div>
                </div>
              ))}
            </div>
          ) : (
            r && (
              <Parch style={{ maxWidth: 760, padding: '24px 32px' }}>
                <div>
                  <div className="fi-cap" style={{ color: 'var(--c-brassLo)' }}>Cause of Loss</div>
                  <div className="fi-display" style={{ fontSize: 26, color: 'var(--c-inkText)', marginTop: 6 }}>{r.sub}</div>
                  <div style={{ fontSize: 13.5, color: 'var(--c-inkText2)', marginTop: 10, lineHeight: 1.5 }}>{r.detail}</div>
                </div>
              </Parch>
            )
          )}
        </div>

        {/* footer stats */}
        <div>
          <hr className="fi-hr" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginTop: 14 }}>
            <Stat label="Turns Played" value={String(gameState?.turnNumber || 0)} />
            <Stat label="Tiles Remaining" value={`${tilesRemaining} / ${totalTiles}`} />
            <Stat label="Final Water" value={`${gameState?.waterLevel || 0}`} />
            <Stat label="Difficulty" value={gameState?.difficulty || 'normal'} />
            <Stat label="Treasures" value={`${captured.length} / 4`} />
          </div>
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              {players.map((p: { id: string; name: string; role: string }) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(8,22,28,.4)', borderRadius: 18, border: `1px solid ${isWin ? 'rgba(202,160,82,.2)' : 'rgba(201,82,58,.2)'}` }}>
                  <PlayerPawn role={p.role} kind="portrait" size={20} />
                  <div className="fi-display-i" style={{ fontSize: 13, color: 'var(--c-parch)' }}>{p.name}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button kind="ghost" onClick={() => navigate('/')}>Back to Home</Button>
              <Button kind="primary" size="lg" glow={isWin}>
                {isWin ? 'Play Again' : 'Try Again'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
