import React from 'react';
import { PieceType, PocketPieces } from '../types';

// Use solid (filled) glyphs for both colors — CSS handles the coloring
const PIECE_CHARS_WHITE: Record<PieceType, string> = {
  p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B',
};

const PIECE_CHARS_BLACK: Record<PieceType, string> = {
  p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B',
};

const PIECE_ORDER: PieceType[] = ['q', 'r', 'b', 'n', 'p'];

interface PocketProps {
  pieces: PocketPieces;
  color: 'white' | 'black';
  isActive: boolean;
  onSelect: (piece: PieceType | null) => void;
  selectedPiece: PieceType | null;
}

const Pocket: React.FC<PocketProps> = ({ pieces, color, isActive, onSelect, selectedPiece }) => {
  const chars = color === 'white' ? PIECE_CHARS_WHITE : PIECE_CHARS_BLACK;

  const totalPieces = Object.values(pieces).reduce((a, b) => a + b, 0);

  const handleClick = (pt: PieceType) => {
    if (!isActive || pieces[pt] === 0) return;
    if (selectedPiece === pt) {
      onSelect(null);
    } else {
      onSelect(pt);
    }
  };

  return (
    <div className={`pocket ${isActive ? 'pocket-active' : ''}`}>
      {totalPieces === 0 && <div className="pocket-empty">--</div>}
      {PIECE_ORDER.map((pt) => {
        if (pieces[pt] === 0) return null;
        const isSelected = selectedPiece === pt;
        return (
          <div
            key={pt}
            className={`pocket-piece ${isSelected ? 'pocket-piece-selected' : ''} ${isActive ? 'pocket-piece-clickable' : ''}`}
            onClick={() => handleClick(pt)}
          >
            <span className={`pocket-piece-char piece-${color}`}>{chars[pt]}</span>
            {pieces[pt] > 1 && <span className="pocket-piece-count">{pieces[pt]}</span>}
          </div>
        );
      })}
    </div>
  );
};

export default Pocket;
