import type { CSSProperties } from 'react';
import { TreasureCard } from '../cards/TreasureCard';
import { useStore } from '../../store/store';
import { useGameState } from '../../hooks/useGameState';
import type { TreasureCard as TreasureCardType } from '@forbidden-island/shared/types/cards';

interface SpecialCardBarProps {
  style?: CSSProperties;
}

/**
 * Floating bar shown to non-current players who hold Helicopter Lift or
 * Sandbags cards. These special cards can be played at any time, even on
 * another player's turn.
 *
 * In solo mode, shows special cards from ALL players' hands.
 */
export function SpecialCardBar({ style }: SpecialCardBarProps) {
  const { myHand, isMyTurn, isSolo, gameState } = useGameState();
  const openOverlay = useStore((s) => s.openOverlay);
  const activeOverlay = useStore((s) => s.activeOverlay);

  // In solo mode, gather special cards from all players' hands
  const specialCards: TreasureCardType[] = isSolo
    ? (gameState?.players ?? []).flatMap((p) =>
        (p.hand ?? []).filter(
          (c: TreasureCardType) => c.type === 'helicopter_lift' || c.type === 'sandbags'
        )
      )
    : myHand.filter(
        (c: TreasureCardType) => c.type === 'helicopter_lift' || c.type === 'sandbags'
      );

  // Don't show if there's already an overlay open or no special cards
  if (specialCards.length === 0 || activeOverlay !== null) return null;

  // In multiplayer, don't show during own turn's action phase
  // In solo mode, always show (since you control all players)
  if (!isSolo && isMyTurn) return null;

  function handleCardClick(card: TreasureCardType) {
    if (card.type === 'helicopter_lift') {
      openOverlay('helicopter_lift', { heliCardId: card.id, heliSelectedPlayerIds: [] });
    } else if (card.type === 'sandbags') {
      openOverlay('sandbags', { sandbagsCardId: card.id });
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        background: 'linear-gradient(180deg, rgba(20,48,56,.85), rgba(8,22,28,.9))',
        border: '1px solid rgba(202,160,82,.35)',
        borderRadius: 10,
        boxShadow: '0 0 0 1px rgba(0,0,0,.3), 0 8px 20px rgba(0,0,0,.4)',
        ...style,
      }}
    >
      <div
        className="fi-mono"
        style={{
          fontSize: 9,
          color: 'var(--c-brassHi)',
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        Play anytime -- no action cost
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {specialCards.map((card: TreasureCardType) => (
          <button
            key={card.id}
            onClick={() => handleCardClick(card)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              animation: 'fi-glow 2s ease-in-out infinite',
              transition: 'transform .15s',
            }}
          >
            <TreasureCard type={card.type} width={60} height={86} glow />
          </button>
        ))}
      </div>
    </div>
  );
}
