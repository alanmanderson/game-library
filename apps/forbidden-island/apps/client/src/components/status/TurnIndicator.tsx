import type { CSSProperties } from 'react';
import { ROLES_BY_ID } from '../../data/roles';
import { PlayerPawn } from '../board/PlayerPawn';

interface TurnIndicatorProps {
  currentPlayer: string;
  role?: string;
  actionsRemaining?: number;
  isYou?: boolean;
  phase?: string;
  style?: CSSProperties;
}

const PHASE_LABELS: Record<string, string> = {
  action: 'Action Phase',
  draw_treasure: 'Drawing Treasure',
  draw_flood: 'Drawing Flood',
  discard: 'Discarding',
  swim: 'Swim to Safety',
  waters_rise: 'Waters Rise!',
};

export function TurnIndicator({ currentPlayer, role, actionsRemaining = 3, isYou, phase = 'action', style }: TurnIndicatorProps) {
  const r = role ? ROLES_BY_ID[role] : null;
  const color = r ? `var(--c-${r.colorVar})` : 'var(--c-brass)';
  const phaseLabel = PHASE_LABELS[phase] || phase;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '10px 16px',
      background: 'linear-gradient(90deg, rgba(20,48,56,.85), rgba(8,22,28,.85))',
      border: '1px solid rgba(202,160,82,.3)',
      borderRadius: 12,
      boxShadow: 'var(--shadow-2)',
      ...style,
    }}>
      {role && <PlayerPawn role={role} kind="portrait" size={42} isActive />}
      <div style={{ flex: 1 }}>
        <div className="fi-cap" style={{ color: isYou ? 'var(--c-brassHi)' : 'var(--c-sand2)' }}>{phaseLabel}</div>
        <div className="fi-display" style={{ fontSize: 20, color: isYou ? 'var(--c-brassHi)' : 'var(--c-parch)', lineHeight: 1.15 }}>
          {isYou ? 'Your turn' : `${currentPlayer}'s turn`}
          {isYou && <span className="fi-display-i" style={{ fontSize: 14, marginLeft: 8, color: 'var(--c-sand)' }}>--- take your move</span>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: '50%',
              background: i < actionsRemaining ? color : 'transparent',
              border: `1.5px solid ${i < actionsRemaining ? color : 'rgba(202,160,82,.4)'}`,
              boxShadow: i < actionsRemaining ? `0 0 10px ${color}80` : 'none',
            }} />
          ))}
        </div>
        <div className="fi-mono" style={{ fontSize: 10, color: 'var(--c-sand2)', letterSpacing: '.1em' }}>
          {actionsRemaining} / 3
        </div>
      </div>
    </div>
  );
}
