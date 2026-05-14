import type { CSSProperties } from 'react';
import { TreasureCard } from './TreasureCard';

interface HandCard {
  id?: string;
  type: string;
}

interface PlayerHandProps {
  cards: HandCard[];
  highlightIndex?: number | null;
  onCardClick?: (index: number) => void;
  cardWidth?: number;
  cardHeight?: number;
  style?: CSSProperties;
}

export function PlayerHand({ cards, highlightIndex, onCardClick, cardWidth = 84, cardHeight = 120, style }: PlayerHandProps) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', ...style }}>
      {cards.map((h, i) => (
        <div
          key={h.id || i}
          onClick={onCardClick ? () => onCardClick(i) : undefined}
          style={{
            transform: highlightIndex === i ? 'translateY(-6px)' : 'none',
            transition: 'transform .2s',
            cursor: onCardClick ? 'pointer' : 'default',
          }}
        >
          <TreasureCard type={h.type} width={cardWidth} height={cardHeight} glow={highlightIndex === i} />
        </div>
      ))}
    </div>
  );
}
