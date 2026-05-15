import React, { useState, useMemo, useCallback } from 'react';
import { PieceType } from '../types';

// ---- FEN parsing ----

type SquarePiece = { type: string; color: 'w' | 'b' } | null;

function parseFen(fen: string): SquarePiece[][] {
  // CrazyhouseBoard FEN may have pocket data like [Qnr] after piece placement
  let placement = fen.split(' ')[0];
  // Remove pocket notation e.g. "[QRbn]" or "[]"
  placement = placement.replace(/\[.*?\]/, '');
  const ranks = placement.split('/');
  const board: SquarePiece[][] = [];

  for (const rank of ranks) {
    const row: SquarePiece[] = [];
    for (const ch of rank) {
      if (ch === '~') continue; // Skip promoted piece markers
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < parseInt(ch, 10); i++) {
          row.push(null);
        }
      } else if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        row.push({ type: ch.toLowerCase(), color });
      }
      // Skip any other characters
    }
    board.push(row);
  }
  return board;
}

// Unicode chess piece map — use the SOLID (black) glyphs for both colors.
// The CSS classes .piece-white / .piece-black handle the actual coloring
// so both sets are always fully filled (not hollow outlines).
const PIECE_CHARS: Record<string, Record<string, string>> = {
  w: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' },
  b: { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' },
};

function squareName(row: number, col: number): string {
  return String.fromCharCode(97 + col) + String(8 - row);
}

// ---- Props ----

interface BoardProps {
  fen: string;
  orientation: 'white' | 'black';
  isMyBoard: boolean;
  isMyTurn: boolean;
  legalMoves: string[];    // e.g. ["e2e4", "d2d4"]
  legalDrops: string[];    // e.g. ["P@e4", "N@d3"]
  lastMove: { from: string; to: string } | null;
  onMove: (from: string, to: string, promotion: string | null) => void;
  onDrop: (piece: string, square: string) => void;
  selectedPocketPiece: PieceType | null;
  boardIndex: number;
}

const PROMOTION_RANK_WHITE = '8';
const PROMOTION_RANK_BLACK = '1';

const Board: React.FC<BoardProps> = ({
  fen,
  orientation,
  isMyBoard,
  isMyTurn,
  legalMoves,
  legalDrops,
  lastMove,
  onMove,
  onDrop,
  selectedPocketPiece,
  boardIndex,
}) => {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);

  const boardData = useMemo(() => parseFen(fen), [fen]);

  // Build set of legal move targets from a selected square
  const legalTargets = useMemo(() => {
    const targets = new Set<string>();
    if (selectedSquare && !selectedPocketPiece) {
      for (const m of legalMoves) {
        if (m.substring(0, 2) === selectedSquare) {
          targets.add(m.substring(2, 4));
        }
      }
    }
    return targets;
  }, [selectedSquare, legalMoves, selectedPocketPiece]);

  // Build set of legal drop targets for the selected pocket piece
  const dropTargets = useMemo(() => {
    const targets = new Set<string>();
    if (selectedPocketPiece) {
      const prefix = selectedPocketPiece.toUpperCase() + '@';
      for (const d of legalDrops) {
        if (d.startsWith(prefix)) {
          targets.add(d.substring(2));
        }
      }
    }
    return targets;
  }, [selectedPocketPiece, legalDrops]);

  const lastMoveSquares = useMemo(() => {
    if (!lastMove) return new Set<string>();
    const squares = new Set<string>();
    if (lastMove.from) squares.add(lastMove.from);
    if (lastMove.to) squares.add(lastMove.to);
    return squares;
  }, [lastMove]);

  const canInteract = isMyBoard && isMyTurn;

  const handleSquareClick = useCallback((sq: string, row: number, col: number) => {
    if (!canInteract) return;

    // If we have a pocket piece selected and this square is a valid drop target
    if (selectedPocketPiece) {
      if (dropTargets.has(sq)) {
        onDrop(selectedPocketPiece, sq);
      }
      // Clicking any square deselects pocket piece via parent
      setSelectedSquare(null);
      return;
    }

    // If we already have a square selected
    if (selectedSquare) {
      if (selectedSquare === sq) {
        // Deselect
        setSelectedSquare(null);
        return;
      }
      if (legalTargets.has(sq)) {
        // Check for pawn promotion
        const fromRow = 8 - parseInt(selectedSquare[1], 10);
        const piece = boardData[fromRow]?.[selectedSquare.charCodeAt(0) - 97];
        let promotion: string | null = null;
        if (piece && piece.type === 'p') {
          const targetRank = sq[1];
          if (
            (piece.color === 'w' && targetRank === PROMOTION_RANK_WHITE) ||
            (piece.color === 'b' && targetRank === PROMOTION_RANK_BLACK)
          ) {
            // TODO: Replace auto-queen with a promotion picker UI that lets the
            // player choose between queen, rook, bishop, and knight. For now,
            // auto-promote to queen as a reasonable default.
            promotion = 'q';
          }
        }
        onMove(selectedSquare, sq, promotion);
        setSelectedSquare(null);
        return;
      }
      // Clicked a different piece of our own - select it instead
    }

    // Try to select this square if it has one of our pieces
    const piece = boardData[row]?.[col];
    if (piece) {
      setSelectedSquare(sq);
    } else {
      setSelectedSquare(null);
    }
  }, [canInteract, selectedPocketPiece, selectedSquare, legalTargets, dropTargets, boardData, onMove, onDrop]);

  // Clear selection when turn changes or pocket piece changes
  React.useEffect(() => {
    setSelectedSquare(null);
  }, [isMyTurn, selectedPocketPiece]);

  // Build the visual rows/cols based on orientation
  const rows = orientation === 'white'
    ? [0, 1, 2, 3, 4, 5, 6, 7]
    : [7, 6, 5, 4, 3, 2, 1, 0];
  const cols = orientation === 'white'
    ? [0, 1, 2, 3, 4, 5, 6, 7]
    : [7, 6, 5, 4, 3, 2, 1, 0];

  const fileLabels = orientation === 'white'
    ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
  const rankLabels = orientation === 'white'
    ? ['8', '7', '6', '5', '4', '3', '2', '1']
    : ['1', '2', '3', '4', '5', '6', '7', '8'];

  return (
    <div className="board-wrapper">
      <div className="board-label">Board {boardIndex === 0 ? 'A' : 'B'}</div>
      <div className="board-container">
        {/* Rank labels on the left */}
        <div className="rank-labels">
          {rankLabels.map((r) => (
            <div key={r} className="coord-label rank-label">{r}</div>
          ))}
        </div>
        <div>
          <div className="board-grid">
            {rows.map((r, ri) =>
              cols.map((c, ci) => {
                const sq = squareName(r, c);
                const piece = boardData[r]?.[c];
                const isLight = (r + c) % 2 === 0;
                const isSelected = selectedSquare === sq;
                const isLegalTarget = legalTargets.has(sq);
                const isDropTarget = selectedPocketPiece ? dropTargets.has(sq) : false;
                const isLastMove = lastMoveSquares.has(sq);
                const hasPiece = piece !== null;

                let squareClass = `square ${isLight ? 'light' : 'dark'}`;
                if (isSelected) squareClass += ' selected';
                if (isLastMove) squareClass += ' last-move';
                if (canInteract && (isLegalTarget || isDropTarget)) {
                  squareClass += ' can-move';
                }

                return (
                  <div
                    key={sq}
                    className={squareClass}
                    style={{ gridRow: ri + 1, gridColumn: ci + 1 }}
                    onClick={() => handleSquareClick(sq, r, c)}
                  >
                    {piece && (
                      <span className={`piece piece-${piece.color === 'w' ? 'white' : 'black'}`}>{PIECE_CHARS[piece.color][piece.type]}</span>
                    )}
                    {canInteract && (isLegalTarget || isDropTarget) && !hasPiece && (
                      <span className="move-dot" />
                    )}
                    {canInteract && isLegalTarget && hasPiece && (
                      <span className="capture-ring" />
                    )}
                  </div>
                );
              })
            )}
          </div>
          {/* File labels at the bottom */}
          <div className="file-labels">
            {fileLabels.map((f) => (
              <div key={f} className="coord-label file-label">{f}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Board;
