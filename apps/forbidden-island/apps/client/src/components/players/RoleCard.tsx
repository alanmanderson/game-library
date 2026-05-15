import type { CSSProperties, MouseEventHandler } from 'react';
import { ROLES_BY_ID } from '../../data/roles';
import { PlayerPawn, type PawnKind } from '../board/PlayerPawn';

interface RoleCardProps {
  role: string;
  pawnKind?: PawnKind;
  claimedBy?: string | null;
  isMe?: boolean;
  available?: boolean;
  compact?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  selected?: boolean;
}

export function RoleCard({ role, pawnKind = 'portrait', claimedBy, isMe, available = true, compact, onClick, selected }: RoleCardProps) {
  const r = ROLES_BY_ID[role];
  if (!r) return null;
  const color = `var(--c-${r.colorVar})`;
  return (
    <div
      onClick={available ? onClick : undefined}
      style={{
        position: 'relative',
        padding: compact ? '10px 12px' : 14,
        borderRadius: 12,
        background: selected
          ? 'linear-gradient(180deg, rgba(232,196,122,.15), rgba(202,160,82,.06))'
          : 'rgba(20,48,56,.5)',
        border: `1px solid ${selected ? 'var(--c-brass)' : 'rgba(202,160,82,.2)'}`,
        boxShadow: selected
          ? '0 0 0 1px var(--c-brassHi), 0 10px 22px rgba(0,0,0,.4)'
          : '0 1px 0 rgba(255,255,255,.04) inset, 0 4px 14px rgba(0,0,0,.35)',
        cursor: available ? 'pointer' : 'not-allowed',
        opacity: available ? 1 : 0.55,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        transition: 'transform .15s, box-shadow .15s',
      }}
    >
      <PlayerPawn role={r.id} kind={pawnKind} size={compact ? 34 : 42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div className="fi-display" style={{ fontSize: compact ? 15 : 17, color: 'var(--c-parch)' }}>{r.name}</div>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
        </div>
        {!compact && (
          <div style={{ fontSize: 11, color: 'var(--c-sand2)', marginTop: 3, lineHeight: 1.4 }}>{r.ability}</div>
        )}
        {claimedBy && (
          <div className="fi-mono" style={{ fontSize: 9.5, marginTop: 4, letterSpacing: '.1em', textTransform: 'uppercase', color: isMe ? 'var(--c-brassHi)' : 'var(--c-sand2)' }}>
            {isMe ? 'YOU' : `Claimed - ${claimedBy}`}
          </div>
        )}
      </div>
    </div>
  );
}
