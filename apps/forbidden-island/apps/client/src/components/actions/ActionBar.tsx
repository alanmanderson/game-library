import type { CSSProperties } from 'react';
import { ActionGlyph } from './ActionGlyph';

const ACTION_DEFS = [
  { id: 'move', name: 'Move', glyph: 'move', hint: '1 tile - adjacent' },
  { id: 'shore', name: 'Shore Up', glyph: 'shore', hint: 'Flip flooded tile' },
  { id: 'give', name: 'Give Card', glyph: 'give', hint: 'Same tile - 1 card' },
  { id: 'capture', name: 'Capture', glyph: 'capt', hint: '4 matching - on tile' },
  { id: 'end', name: 'End Turn', glyph: 'end', hint: 'Pass to next' },
] as const;

interface ActionBarProps {
  available?: Record<string, boolean>;
  hint?: Record<string, boolean>;
  activeMode?: string | null;
  onSelect?: (actionId: string) => void;
  style?: CSSProperties;
}

export function ActionBar({
  available = { move: true, shore: true, give: false, capture: false, end: true },
  hint = {},
  activeMode,
  onSelect,
  style,
}: ActionBarProps) {
  return (
    <div style={{
      display: 'flex', gap: 8, padding: 8,
      background: 'linear-gradient(180deg, rgba(20,48,56,.9), rgba(8,22,28,.95))',
      border: '1px solid rgba(202,160,82,.35)',
      borderRadius: 14,
      boxShadow: 'var(--shadow-2)',
      ...style,
    }}>
      {ACTION_DEFS.map((a) => {
        const enabled = available[a.id] ?? false;
        const active = activeMode === a.id;
        const glowHint = (hint[a.id] ?? false) && enabled;
        return (
          <button
            key={a.id}
            disabled={!enabled}
            onClick={() => onSelect?.(a.id)}
            className="fi"
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '10px 6px',
              border: `1px solid ${active ? 'var(--c-brassHi)' : 'rgba(202,160,82,.2)'}`,
              borderRadius: 10,
              background: active
                ? 'linear-gradient(180deg, rgba(232,196,122,.25), rgba(202,160,82,.08))'
                : 'rgba(8,22,28,.3)',
              color: enabled ? 'var(--c-parch)' : 'rgba(232,212,166,.3)',
              cursor: enabled ? 'pointer' : 'not-allowed',
              boxShadow: glowHint ? '0 0 0 1px var(--c-brassHi), 0 0 18px rgba(232,196,122,.5)' : 'none',
              animation: glowHint ? 'fi-pulse 1.6s ease-in-out infinite' : 'none',
              transition: 'all .15s',
            }}
          >
            <ActionGlyph kind={a.glyph} size={22} color={active ? 'var(--c-brassHi)' : 'currentColor'} />
            <div style={{ fontFamily: 'var(--ff-ui)', fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>{a.name}</div>
            <div className="fi-mono" style={{ fontSize: 8.5, color: 'var(--c-sand2)', opacity: enabled ? 0.85 : 0.4, letterSpacing: '.06em' }}>{a.hint}</div>
          </button>
        );
      })}
    </div>
  );
}
