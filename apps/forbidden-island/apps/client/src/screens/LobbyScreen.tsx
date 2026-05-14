import { useNavigate, useParams } from 'react-router-dom';
import { ScreenBg } from '../components/ui/ScreenBg';
import { BrandMark } from '../components/ui/BrandMark';
import { Frame } from '../components/ui/Frame';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { PlayerPawn } from '../components/board/PlayerPawn';
import { RoleCard } from '../components/players/RoleCard';
import { ROLES } from '../data/roles';
import { useStore } from '../store/store';
import type { LobbyPlayer } from '@forbidden-island/shared/types/lobby';
import type { Difficulty } from '@forbidden-island/shared/types/game';

export function LobbyScreen() {
  const navigate = useNavigate();
  const { id: gameId } = useParams<{ id: string }>();
  const lobby = useStore((s) => s.currentLobby);
  const myId = useStore((s) => s.playerId);
  const send = useStore((s) => s.send);

  const players = lobby?.players || [];
  const isHost = players.find((p: LobbyPlayer) => p.id === myId)?.isHost ?? false;
  const allRolesSelected = players.every((p: LobbyPlayer) => p.role !== null);
  const canStart = players.length >= 2 && allRolesSelected;
  const claimedRoles: Record<string, string> = {};
  players.forEach((p: LobbyPlayer) => {
    if (p.role) claimedRoles[p.role] = p.name;
  });
  const _myRole = players.find((p: LobbyPlayer) => p.id === myId)?.role;

  // build 4 slots
  const slots = [...Array(4)].map((_, i) => players[i] || null);

  function handleSelectRole(roleId: string) {
    send({ type: 'lobby:select_role', role: roleId as any });
  }

  function handleStart() {
    send({ type: 'lobby:start' });
  }

  function handleLeave() {
    send({ type: 'lobby:leave' });
    navigate('/');
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/game/${gameId}/lobby`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  return (
    <ScreenBg>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '34px 48px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <BrandMark size="md" />
          <Button kind="ghost" size="sm" onClick={handleLeave}>Leave Expedition</Button>
        </div>

        {/* room banner */}
        <Frame tone="ink2" style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div className="fi-cap">Expedition #</div>
            <div className="fi-display" style={{ fontSize: 30, color: 'var(--c-brassHi)', letterSpacing: '.05em' }}>
              {gameId?.toUpperCase() || '---'}
            </div>
            <div className="fi-mono" style={{ fontSize: 10, color: 'var(--c-sand2)', marginTop: 4 }}>SHARE THIS CODE OR THE LINK BELOW</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                readOnly
                value={`${window.location.origin}/game/${gameId}/lobby`}
                className="fi"
                style={{
                  flex: 1, padding: '8px 12px', fontSize: 11.5, fontFamily: 'var(--ff-mono)',
                  background: 'rgba(8,22,28,.5)', color: 'var(--c-sand)',
                  border: '1px solid rgba(202,160,82,.25)', borderRadius: 6, outline: 'none',
                }}
              />
              <Button kind="ghost" size="sm" onClick={handleCopyLink}>Copy</Button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Pill tone="brass">{lobby?.difficulty || 'Normal'} - Water {lobby ? ({ novice: 1, normal: 2, elite: 3, legendary: 4 } as Record<Difficulty, number>)[lobby.difficulty] : 2}</Pill>
              <Pill tone="sea">{players.length} / 4 aboard</Pill>
            </div>
          </div>
        </Frame>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 22 }}>
          {/* Player slots */}
          <Frame tone="ink2" padded={false} style={{ padding: 18 }}>
            <div className="fi-cap" style={{ marginBottom: 10 }}>Crew</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {slots.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 10,
                  background: s ? 'rgba(8,22,28,.55)' : 'transparent',
                  border: `1px ${s ? 'solid' : 'dashed'} ${s ? 'rgba(202,160,82,.18)' : 'rgba(202,160,82,.25)'}`,
                }}>
                  {s ? (
                    <>
                      {s.role && <PlayerPawn role={s.role} kind="portrait" size={38} isActive={s.id === myId} />}
                      {!s.role && (
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(8,22,28,.6)', border: '1px dashed rgba(202,160,82,.4)' }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <div className="fi-display" style={{ fontSize: 16, color: 'var(--c-parch)' }}>{s.name}</div>
                          {s.isHost && <Pill tone="brass">Host</Pill>}
                          {s.id === myId && <Pill tone="sand">You</Pill>}
                        </div>
                        <div className="fi-mono" style={{ fontSize: 9.5, color: 'var(--c-sand2)', marginTop: 2, letterSpacing: '.1em' }}>
                          {s.role ? s.role.toUpperCase() : 'CHOOSING ROLE...'}
                        </div>
                      </div>
                      {s.role && (
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%',
                          background: 'rgba(94,138,58,.2)', border: '1px solid var(--c-leaf)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--c-leaf)', fontSize: 13,
                        }}>&#10003;</div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{
                        width: 38, height: 38, borderRadius: '50%',
                        background: 'rgba(8,22,28,.6)', border: '1px dashed rgba(202,160,82,.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--c-brass)', animation: 'fi-pulse 1.4s ease-in-out infinite' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="fi-display-i" style={{ fontSize: 14, color: 'var(--c-sand2)' }}>Awaiting player...</div>
                        <div className="fi-mono" style={{ fontSize: 9.5, color: 'var(--c-sand2)', opacity: 0.7, marginTop: 2 }}>SLOT {i + 1}</div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Frame>
          {/* Role selection */}
          <Frame tone="ink2" padded={false} style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="fi-cap">Choose Your Role</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {ROLES.map((r) => {
                const c = claimedRoles[r.id];
                const isMe = c ? (players.find((p: LobbyPlayer) => p.role === r.id)?.id === myId) : false;
                return (
                  <RoleCard
                    key={r.id}
                    role={r.id}
                    pawnKind="portrait"
                    selected={isMe}
                    claimedBy={c || null}
                    isMe={isMe}
                    available={!c || isMe}
                    onClick={() => handleSelectRole(r.id)}
                  />
                );
              })}
            </div>
          </Frame>
        </div>

        {/* host controls */}
        {isHost && (
          <Frame tone="ink2" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ flex: 1 }}>
              <div className="fi-cap">Host Controls</div>
              <div style={{ display: 'flex', gap: 14, marginTop: 6, alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: 'var(--c-sand)' }}>Difficulty</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['novice', 'normal', 'elite', 'legendary'] as const).map((d) => (
                    <button
                      key={d}
                      className="fi"
                      onClick={() => send({ type: 'lobby:set_difficulty', difficulty: d })}
                      style={{
                        padding: '5px 10px', fontSize: 11, letterSpacing: '.05em',
                        background: lobby?.difficulty === d ? 'var(--c-brass)' : 'transparent',
                        color: lobby?.difficulty === d ? 'var(--c-ink)' : 'var(--c-sand)',
                        border: '1px solid rgba(202,160,82,.3)', borderRadius: 6, fontWeight: 600, textTransform: 'uppercase',
                      }}
                    >{d}</button>
                  ))}
                </div>
              </div>
            </div>
            <Button kind="primary" size="lg" glow={canStart} disabled={!canStart} onClick={handleStart}>Set Sail</Button>
          </Frame>
        )}
      </div>
    </ScreenBg>
  );
}
