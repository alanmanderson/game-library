import type { Color, AnalysisMoveRecord, MoveQuality } from "../types/game";

interface Props {
  moveHistory: AnalysisMoveRecord[];
  currentMoveIndex: number;
  playerColor: Color;
  onJumpToMove: (n: number) => void;
}

const QUALITY_LABELS: Record<string, string> = {
  best: "Best",
  good: "Good",
  very_good: "Best",
  inaccuracy: "Inaccuracy",
  doubtful: "Doubtful",
  mistake: "Mistake",
  bad: "Bad",
  blunder: "Blunder",
  very_bad: "Blunder",
};

function qualityClass(q: MoveQuality | string | null): string {
  if (!q) return "";
  return `analysis-moves__quality--${q}`;
}

function AnalysisMovesTab({
  moveHistory,
  currentMoveIndex,
  playerColor: _playerColor,
  onJumpToMove,
}: Props) {
  if (moveHistory.length === 0) {
    return (
      <div
        style={{
          color: "var(--text-secondary)",
          fontSize: "0.85rem",
          padding: "16px 0",
          textAlign: "center",
        }}
      >
        No moves yet
      </div>
    );
  }

  // Group moves into pairs (white move + black move = one row)
  const rows: {
    num: number;
    white?: AnalysisMoveRecord;
    black?: AnalysisMoveRecord;
  }[] = [];
  for (const move of moveHistory) {
    if (move.player === "white") {
      rows.push({ num: Math.ceil(move.move_number / 2), white: move });
    } else {
      const lastRow = rows[rows.length - 1];
      if (lastRow && !lastRow.black) {
        lastRow.black = move;
      } else {
        rows.push({ num: Math.ceil(move.move_number / 2), black: move });
      }
    }
  }

  return (
    <div className="analysis-moves">
      {rows.map((row) => (
        <div key={row.num} className="analysis-moves__row">
          <span className="analysis-moves__num">{row.num}.</span>
          <MoveCell
            move={row.white}
            isActive={
              row.white
                ? currentMoveIndex === row.white.move_number - 1
                : false
            }
            onClick={() => row.white && onJumpToMove(row.white.move_number)}
          />
          <MoveCell
            move={row.black}
            isActive={
              row.black
                ? currentMoveIndex === row.black.move_number - 1
                : false
            }
            onClick={() => row.black && onJumpToMove(row.black.move_number)}
          />
        </div>
      ))}
    </div>
  );
}

function MoveCell({
  move,
  isActive,
  onClick,
}: {
  move?: AnalysisMoveRecord;
  isActive: boolean;
  onClick: () => void;
}) {
  if (!move) return <div className="analysis-moves__cell" />;

  return (
    <div
      className={`analysis-moves__cell${isActive ? " analysis-moves__row--active" : ""}`}
      onClick={onClick}
      style={{ cursor: "pointer", padding: "2px 4px", borderRadius: 3 }}
    >
      <span className="analysis-moves__dice">{move.dice_roll}</span>
      <span className="analysis-moves__notation">
        {move.move_notation || "\u2014"}
      </span>
      {move.quality && (
        <span
          className={`analysis-moves__quality ${qualityClass(move.quality)}`}
        >
          {QUALITY_LABELS[move.quality] || move.quality}
          {move.equity_loss != null && move.equity_loss > 0.001 && (
            <>
              {" "}
              ({move.equity_loss > 0 ? "-" : ""}
              {Math.abs(move.equity_loss).toFixed(3)})
            </>
          )}
        </span>
      )}
    </div>
  );
}

export default AnalysisMovesTab;
