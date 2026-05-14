import { ROLES_BY_ID } from '../../data/roles';
import { PlayerPawn, type PawnKind } from '../board/PlayerPawn';

interface PlayerInfoProps {
  name: string;
  role: string;
  isActive?: boolean;
  isYou?: boolean;
  handCount?: number;
  isConnected?: boolean;
  pawnKind?: PawnKind;
}

export function PlayerInfo({ name, role, isActive, isYou, handCount = 0, isConnected = true, pawnKind = 'portrait' }: PlayerInfoProps) {
  const r = ROLES_BY_ID[role];
  const color = r ? `var(--c-${r.colorVar})` : 'var(--c-brass)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 10,
      background: isActive ? 'rgba(232,196,122,.1)' : 'rgba(8,22,28,.4)',
      border: `1px solid ${isActive ? 'var(--c-brass)' : 'rgba(202,160,82,.15)'}`,
      opacity: isConnected ? 1 : 0.55,
      position: 'relative',
    }}>
      <PlayerPawn role={role} kind={pawnKind} size={36} isActive={isActive} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <div className="fi-display" style={{ fontSize: 14, color: 'var(--c-parch)', lineHeight: 1, fontWeight: isYou ? 500 : 400 }}>
            {name}
            {isYou && <span className="fi-cap" style={{ marginLeft: 6, color: 'var(--c-brassHi)' }}>You</span>}
          </div>
        </div>
        <div className="fi-mono" style={{ fontSize: 9, color, letterSpacing: '.1em', textTransform: 'uppercase', marginTop: 2 }}>
          {r ? r.name : '---'} {!isConnected && '- offline'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <div className="fi-mono" style={{ fontSize: 9, color: 'var(--c-sand2)' }}>HAND</div>
        <div style={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{
              width: 5, height: 9, borderRadius: 1.5,
              background: i < handCount ? 'var(--c-brass)' : 'transparent',
              border: '1px solid rgba(202,160,82,.4)',
            }} />
          ))}
          <span className="fi-mono" style={{ fontSize: 10, color: handCount > 5 ? 'var(--c-danger)' : 'var(--c-sand)', marginLeft: 4, fontWeight: 600 }}>{handCount}</span>
        </div>
      </div>
    </div>
  );
}
