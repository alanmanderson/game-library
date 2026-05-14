import { useState } from 'react';
import { Frame } from '../ui/Frame';
import { Button } from '../ui/Button';
import { PlayerPawn } from '../board/PlayerPawn';
import { TreasureCard } from '../cards/TreasureCard';
import { useStore } from '../../store/store';
import { useActions } from '../../hooks/useActions';
import { OverlayBackdrop } from './OverlayBackdrop';
import type { ClientPlayerView } from '@forbidden-island/shared/types/players';
import type { TreasureCard as TreasureCardType } from '@forbidden-island/shared/types/cards';

export function DiscardOverlay() {
  const gameState = useStore((s) => s.gameState);
  const overlayData = useStore((s) => s.overlayData);
  const openOverlay = useStore((s) => s.openOverlay);
  const { discard, playHelicopterLift, playSandbags } = useActions();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const discardingId = overlayData.discardingPlayerId ?? gameState?.discardingPlayerId;
  const discardingPlayer = gameState?.players.find(
    (p: ClientPlayerView) => p.id === discardingId
  );

  if (!discardingPlayer) return null;

  const hand: TreasureCardType[] = discardingPlayer.hand ?? [];
  const handCount = hand.length;
  const myId = gameState?.myPlayerId;
  const isMe = discardingId === myId;

  function handleDiscard(card: TreasureCardType) {
    if (!isMe) return;
    discard(card.id);
  }

  function handlePlaySpecial(card: TreasureCardType) {
    if (!isMe) return;
    if (card.type === 'helicopter_lift') {
      openOverlay('helicopter_lift', { heliCardId: card.id, heliSelectedPlayerIds: [] });
    } else if (card.type === 'sandbags') {
      openOverlay('sandbags', { sandbagsCardId: card.id });
    }
  }

  return (
    <OverlayBackdrop opacity={0.65}>
      <Frame tone="ink2" padded={false} style={{ padding: 24, maxWidth: 820, width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <PlayerPawn role={discardingPlayer.role} size={44} isActive />
          <div>
            <div className="fi-cap" style={{ color: 'var(--c-brassHi)' }}>
              Hand Limit Exceeded
            </div>
            <div className="fi-display" style={{ fontSize: 22, color: 'var(--c-parch)' }}>
              {discardingPlayer.name} holds{' '}
              <span className="fi-display-i">{numberWord(handCount)}</span> cards.
              {isMe ? ' Discard one.' : ' Waiting...'}
            </div>
            {isMe && (
              <div style={{ fontSize: 11.5, color: 'var(--c-sand2)', marginTop: 4 }}>
                Click a card to discard it — or play a special card instead.
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          <div
            className="fi-mono"
            style={{ fontSize: 11, color: 'var(--c-danger)', letterSpacing: '.15em' }}
          >
            {handCount} / 5
          </div>
        </div>

        {/* Cards */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {hand.map((card: TreasureCardType, i: number) => {
            const isSpecial = card.type === 'helicopter_lift' || card.type === 'sandbags';
            const isHovered = hoveredIndex === i;
            return (
              <div
                key={card.id || i}
                style={{
                  position: 'relative',
                  cursor: isMe ? 'pointer' : 'default',
                  transform: isHovered && isMe ? 'translateY(-6px)' : 'none',
                  transition: 'transform .15s',
                }}
                onMouseEnter={() => isMe && setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => handleDiscard(card)}
              >
                <TreasureCard type={card.type} width={100} height={140} />
                {/* Discard badge on hover */}
                {isHovered && isMe && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -10,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'var(--c-danger)',
                      color: '#fff',
                      padding: '3px 9px',
                      borderRadius: 14,
                      fontFamily: 'var(--ff-mono)',
                      fontSize: 9.5,
                      letterSpacing: '.12em',
                      boxShadow: '0 4px 12px rgba(0,0,0,.4)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    DISCARD
                  </div>
                )}
                {/* Play Instead? for special cards */}
                {isSpecial && isMe && (
                  <div style={{ position: 'absolute', bottom: -12, left: '50%', transform: 'translateX(-50%)' }}>
                    <Button
                      size="sm"
                      kind="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlaySpecial(card);
                      }}
                    >
                      Play instead?
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Frame>
    </OverlayBackdrop>
  );
}

function numberWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return words[n] ?? String(n);
}
