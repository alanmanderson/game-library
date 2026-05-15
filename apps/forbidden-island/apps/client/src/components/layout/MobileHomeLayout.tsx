import { ScreenBg } from '../ui/ScreenBg';
import { BrandMark } from '../ui/BrandMark';
import { Frame } from '../ui/Frame';
import { Button } from '../ui/Button';
import { Pill } from '../ui/Pill';
import type { GameListEntry } from '@forbidden-island/shared/types/lobby';

interface MobileHomeLayoutProps {
  name: string;
  onNameChange: (name: string) => void;
  canCreate: boolean;
  onCreateGame: () => void;
  onJoinGame: (gameId: string) => void;
  onRejoin?: () => void;
  games: GameListEntry[];
  hasRejoin: boolean;
}

export function MobileHomeLayout({
  name,
  onNameChange,
  canCreate,
  onCreateGame,
  onJoinGame,
  onRejoin,
  games,
  hasRejoin,
}: MobileHomeLayoutProps) {
  return (
    <ScreenBg>
      <div style={{
        padding: '34px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        height: '100%',
        overflowY: 'auto',
      }}>
        <BrandMark size="md" />

        <div className="fi-display-i" style={{
          fontSize: 15,
          color: 'var(--c-sand)',
          lineHeight: 1.45,
        }}>
          Four sacred treasures lie scattered across a sinking island. Recover them with your crew.
        </div>

        <Frame tone="ink2" padded={false} style={{ padding: 14 }}>
          <div className="fi-cap" style={{ marginBottom: 6 }}>Your Name</div>
          <input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={20}
            placeholder="Mariner..."
            className="fi"
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 14,
              background: 'rgba(8,22,28,.6)',
              color: 'var(--c-parch)',
              border: '1px solid var(--c-brassLo)',
              borderRadius: 8,
              fontFamily: 'var(--ff-display)',
              fontStyle: 'italic',
              outline: 'none',
            }}
          />
          <Button
            kind="primary"
            size="lg"
            glow={canCreate}
            disabled={!canCreate}
            onClick={onCreateGame}
            style={{ width: '100%', marginTop: 10 }}
          >
            Create Game
          </Button>
        </Frame>

        {/* Rejoin banner */}
        {hasRejoin && onRejoin && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px dashed var(--c-brassHi)',
            background: 'rgba(232,196,122,.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--c-brassHi)',
              boxShadow: '0 0 8px var(--c-brassHi)',
              animation: 'fi-pulse 1.6s ease-in-out infinite',
            }} />
            <div style={{ flex: 1, fontSize: 12, color: 'var(--c-sand)' }}>
              <span className="fi-display-i" style={{ fontSize: 13, color: 'var(--c-brassHi)' }}>Voyage in progress.</span> Rejoin?
            </div>
            <Button kind="ghost" size="sm" onClick={onRejoin}>Rejoin</Button>
          </div>
        )}

        {/* Open expeditions */}
        <div>
          <div className="fi-cap" style={{ marginBottom: 8 }}>
            Open Expeditions &middot; {games.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {games.map((g) => (
              <div key={g.gameId} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                background: 'rgba(20,48,56,.5)',
                borderRadius: 10,
                border: '1px solid rgba(202,160,82,.2)',
              }}>
                <div style={{ flex: 1 }}>
                  <div className="fi-display" style={{ fontSize: 14, color: 'var(--c-parch)' }}>
                    {g.hostName}&apos;s
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                    <Pill tone="brass" style={{ fontSize: 8.5, padding: '2px 6px' }}>{g.difficulty}</Pill>
                    <Pill tone="sea" style={{ fontSize: 8.5, padding: '2px 6px' }}>{g.playerCount}/{g.maxPlayers}</Pill>
                  </div>
                </div>
                <Button size="sm" disabled={!canCreate} onClick={() => onJoinGame(g.gameId)}>Join</Button>
              </div>
            ))}
            {games.length === 0 && (
              <div className="fi-display-i" style={{
                fontSize: 14,
                color: 'var(--c-sand2)',
                textAlign: 'center',
                padding: '18px 0',
              }}>
                No expeditions afoot. Create one!
              </div>
            )}
          </div>
        </div>
      </div>
    </ScreenBg>
  );
}
