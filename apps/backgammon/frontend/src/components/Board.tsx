import { useMemo, useCallback } from "react";
import type { GameState, Color, Move } from "../types/game";
import "./styles/Board.css";

interface BoardProps {
  gameState: GameState;
  myColor: Color;
  selectedPoint: number | null;
  validMoves: Move[];
  onPointClick: (point: number) => void;
  onBarClick: () => void;
  onBearOffClick: () => void;
  cubeValue: number;
  cubeOwner: Color | null;
}

// ----- Layout constants -----
const BOARD_WIDTH = 800;
const BOARD_HEIGHT = 600;
const MARGIN = 20;
const BAR_WIDTH = 40;
const BEAROFF_WIDTH = 40;
const POINT_WIDTH = 52;
const TRIANGLE_HEIGHT = 230;
const CHECKER_RADIUS = 22;
const CHECKER_GAP = 4;
const MAX_VISIBLE_CHECKERS = 5;

// Derived constants are now computed inside the component based on myColor.

// Colors
const DARK_TRIANGLE = "#5c3d2e";
const LIGHT_TRIANGLE = "#c69c6d";
const BOARD_BG = "#3e6b35";
const BORDER_COLOR = "#2a1a0e";
const HIGHLIGHT_SOURCE = "rgba(212, 168, 67, 0.35)";
const HIGHLIGHT_SELECTED = "rgba(255, 215, 0, 0.6)";
const HIGHLIGHT_DEST = "rgba(46, 204, 113, 0.5)";
const WHITE_CHECKER_FILL = "#f0e6d3";
const WHITE_CHECKER_STROKE = "#b8a88a";
const BLACK_CHECKER_FILL = "#2b2b2b";
const BLACK_CHECKER_STROKE = "#555";
const BAR_FILL = "#3e2a1c";

// columnX is now computed inside the component using layout-dependent values.

function Board({
  gameState,
  myColor,
  selectedPoint,
  validMoves,
  onPointClick,
  onBarClick,
  onBearOffClick,
  cubeValue,
  cubeOwner,
}: BoardProps) {
  /**
   * Layout positions depend on myColor.
   *
   * White: | points | BAR | points | BEAROFF |
   * Black: | BEAROFF | points | BAR | points |
   */
  const layout = useMemo(() => {
    if (myColor === "black") {
      const bearoffX = MARGIN;
      const leftSectionX = MARGIN + BEAROFF_WIDTH;
      const barX = MARGIN + BEAROFF_WIDTH + 6 * POINT_WIDTH;
      const rightSectionX = barX + BAR_WIDTH;
      return { bearoffX, leftSectionX, barX, rightSectionX };
    }
    // White (default)
    const leftSectionX = MARGIN;
    const barX = MARGIN + 6 * POINT_WIDTH;
    const rightSectionX = barX + BAR_WIDTH;
    const bearoffX = rightSectionX + 6 * POINT_WIDTH;
    return { bearoffX, leftSectionX, barX, rightSectionX };
  }, [myColor]);

  /**
   * Get the X position for a given visual column index (0-11), accounting for the bar.
   * Columns 0-5 are left of bar, 6-11 are right of bar.
   */
  const columnX = useCallback(
    (col: number): number => {
      if (col < 6) {
        return layout.leftSectionX + col * POINT_WIDTH + POINT_WIDTH / 2;
      }
      return layout.rightSectionX + (col - 6) * POINT_WIDTH + POINT_WIDTH / 2;
    },
    [layout],
  );

  /**
   * Map each board point (1-24) to a visual column (0-11) and row (top/bottom).
   *
   * WHITE's perspective:
   *   Top row (L-R):    13 14 15 16 17 18 | BAR | 19 20 21 22 23 24
   *   Bottom row (L-R): 12 11 10  9  8  7 | BAR |  6  5  4  3  2  1
   *   Bear-off: right side. White's home is bottom-right (1-6).
   *
   * BLACK's perspective (180° rotation):
   *   Bottom row (L-R): 24 23 22 21 20 19 | BAR | 18 17 16 15 14 13
   *   Top row (L-R):     1  2  3  4  5  6 | BAR |  7  8  9 10 11 12
   *   Bear-off: left side. Black's home is bottom-left (19-24).
   */
  const pointPositions = useMemo(() => {
    const positions: Record<number, { col: number; isTop: boolean }> = {};

    if (myColor === "black") {
      // Bottom row (left of bar, cols 0-5): points 24, 23, 22, 21, 20, 19
      for (let i = 0; i < 6; i++) {
        positions[24 - i] = { col: i, isTop: false };
      }
      // Bottom row (right of bar, cols 6-11): points 18, 17, 16, 15, 14, 13
      for (let i = 0; i < 6; i++) {
        positions[18 - i] = { col: 6 + i, isTop: false };
      }
      // Top row (left of bar, cols 0-5): points 1, 2, 3, 4, 5, 6
      for (let i = 0; i < 6; i++) {
        positions[1 + i] = { col: i, isTop: true };
      }
      // Top row (right of bar, cols 6-11): points 7, 8, 9, 10, 11, 12
      for (let i = 0; i < 6; i++) {
        positions[7 + i] = { col: 6 + i, isTop: true };
      }
    } else {
      // White (default)
      // Top row: points 13-18 (left of bar), then 19-24 (right of bar)
      for (let i = 0; i < 6; i++) {
        positions[13 + i] = { col: i, isTop: true };
      }
      for (let i = 0; i < 6; i++) {
        positions[19 + i] = { col: 6 + i, isTop: true };
      }
      // Bottom row: points 12-7 (left of bar), then 6-1 (right of bar)
      for (let i = 0; i < 6; i++) {
        positions[12 - i] = { col: i, isTop: false };
      }
      for (let i = 0; i < 6; i++) {
        positions[6 - i] = { col: 6 + i, isTop: false };
      }
    }

    return positions;
  }, [myColor]);

  // Determine which source points have valid moves
  const validSourcePoints = useMemo(() => {
    const sources = new Set<number>();
    for (const move of validMoves) {
      sources.add(move.from_point);
    }
    return sources;
  }, [validMoves]);

  // Determine valid destination points from the selected source
  const validDestinations = useMemo(() => {
    if (selectedPoint === null) return new Set<number>();
    const dests = new Set<number>();
    for (const move of validMoves) {
      if (move.from_point === selectedPoint) {
        dests.add(move.to_point);
      }
    }
    return dests;
  }, [selectedPoint, validMoves]);

  // Check if the bar is a valid source
  const barIsSource = useMemo(() => {
    const barPoint = myColor === "white" ? 25 : 0;
    return validSourcePoints.has(barPoint);
  }, [validSourcePoints, myColor]);

  // Check if bearing off is a valid destination
  const bearOffIsDestination = useMemo(() => {
    const offPoint = myColor === "white" ? 0 : 25;
    return validDestinations.has(offPoint);
  }, [validDestinations, myColor]);

  // Check if bar is selected
  const barIsSelected = useMemo(() => {
    const barPoint = myColor === "white" ? 25 : 0;
    return selectedPoint === barPoint;
  }, [selectedPoint, myColor]);

  const handlePointClick = useCallback(
    (point: number) => {
      onPointClick(point);
    },
    [onPointClick],
  );

  // ----- Render helpers -----

  function renderTriangle(
    col: number,
    isTop: boolean,
    colorIndex: number,
  ) {
    const cx = columnX(col);
    const halfWidth = POINT_WIDTH / 2 - 2;
    const fill = colorIndex % 2 === 0 ? DARK_TRIANGLE : LIGHT_TRIANGLE;

    if (isTop) {
      // Triangle pointing down
      const y0 = MARGIN;
      const y1 = MARGIN + TRIANGLE_HEIGHT;
      return (
        <polygon
          points={`${cx - halfWidth},${y0} ${cx + halfWidth},${y0} ${cx},${y1}`}
          fill={fill}
          stroke={BORDER_COLOR}
          strokeWidth={0.5}
        />
      );
    } else {
      // Triangle pointing up
      const y0 = BOARD_HEIGHT - MARGIN;
      const y1 = BOARD_HEIGHT - MARGIN - TRIANGLE_HEIGHT;
      return (
        <polygon
          points={`${cx - halfWidth},${y0} ${cx + halfWidth},${y0} ${cx},${y1}`}
          fill={fill}
          stroke={BORDER_COLOR}
          strokeWidth={0.5}
        />
      );
    }
  }

  function renderChecker(
    cx: number,
    cy: number,
    color: Color,
    key: string,
  ) {
    const fill = color === "white" ? WHITE_CHECKER_FILL : BLACK_CHECKER_FILL;
    const stroke = color === "white" ? WHITE_CHECKER_STROKE : BLACK_CHECKER_STROKE;

    return (
      <g key={key} className="checker">
        <circle cx={cx} cy={cy} r={CHECKER_RADIUS} fill={fill} stroke={stroke} strokeWidth={1.5} />
        {/* Inner ring for visual depth */}
        <circle
          cx={cx}
          cy={cy}
          r={CHECKER_RADIUS - 5}
          fill="none"
          stroke={stroke}
          strokeWidth={0.5}
          opacity={0.5}
        />
      </g>
    );
  }

  function renderCheckersOnPoint(point: number) {
    const pos = pointPositions[point];
    if (!pos) return null;

    // Points array: index 0 is unused, index 1 = point 1, etc.
    const value = gameState.points[point];
    if (value === 0) return null;

    const color: Color = value > 0 ? "white" : "black";
    const count = Math.abs(value);
    const visibleCount = Math.min(count, MAX_VISIBLE_CHECKERS);
    const cx = columnX(pos.col);
    const elements: JSX.Element[] = [];

    for (let i = 0; i < visibleCount; i++) {
      let cy: number;
      if (pos.isTop) {
        cy = MARGIN + CHECKER_RADIUS + i * (CHECKER_RADIUS * 2 + CHECKER_GAP);
      } else {
        cy =
          BOARD_HEIGHT -
          MARGIN -
          CHECKER_RADIUS -
          i * (CHECKER_RADIUS * 2 + CHECKER_GAP);
      }
      elements.push(renderChecker(cx, cy, color, `checker-${point}-${i}`));
    }

    // Badge for count > 5
    if (count > MAX_VISIBLE_CHECKERS) {
      const badgeCy = pos.isTop
        ? MARGIN +
          CHECKER_RADIUS +
          (visibleCount - 1) * (CHECKER_RADIUS * 2 + CHECKER_GAP)
        : BOARD_HEIGHT -
          MARGIN -
          CHECKER_RADIUS -
          (visibleCount - 1) * (CHECKER_RADIUS * 2 + CHECKER_GAP);
      elements.push(
        <g key={`badge-${point}`}>
          <circle cx={cx} cy={badgeCy} r={10} fill="rgba(0,0,0,0.7)" />
          <text
            x={cx}
            y={badgeCy + 4}
            textAnchor="middle"
            fill="#fff"
            fontSize={11}
            fontWeight="bold"
          >
            {count}
          </text>
        </g>,
      );
    }

    return <g key={`checkers-${point}`}>{elements}</g>;
  }

  function renderBarCheckers() {
    const elements: JSX.Element[] = [];
    const barCx = layout.barX + BAR_WIDTH / 2;
    const centerY = BOARD_HEIGHT / 2;
    const step = CHECKER_RADIUS * 2 + CHECKER_GAP;

    // For White's view: white bar checkers stack toward bottom, black toward top
    // For Black's view: black bar checkers stack toward bottom, white toward top
    const whiteIsTop = myColor === "black";
    const blackIsTop = myColor !== "black";

    // White bar checkers — start at center, stack outward
    if (gameState.bar_white > 0) {
      const count = Math.min(gameState.bar_white, 4);
      const isTop = whiteIsTop;
      for (let i = 0; i < count; i++) {
        const cy = isTop
          ? centerY - CHECKER_RADIUS - 8 - i * step
          : centerY + CHECKER_RADIUS + 8 + i * step;
        elements.push(
          renderChecker(barCx, cy, "white", `bar-white-${i}`),
        );
      }
      if (gameState.bar_white > 4) {
        const lastCy = isTop
          ? centerY - CHECKER_RADIUS - 8 - (count - 1) * step
          : centerY + CHECKER_RADIUS + 8 + (count - 1) * step;
        elements.push(
          <g key="bar-white-badge">
            <circle cx={barCx} cy={lastCy} r={10} fill="rgba(0,0,0,0.7)" />
            <text x={barCx} y={lastCy + 4} textAnchor="middle" fill="#fff" fontSize={11} fontWeight="bold">
              {gameState.bar_white}
            </text>
          </g>,
        );
      }
    }

    // Black bar checkers — start at center, stack outward
    if (gameState.bar_black > 0) {
      const count = Math.min(gameState.bar_black, 4);
      const isTop = blackIsTop;
      for (let i = 0; i < count; i++) {
        const cy = isTop
          ? centerY - CHECKER_RADIUS - 8 - i * step
          : centerY + CHECKER_RADIUS + 8 + i * step;
        elements.push(
          renderChecker(barCx, cy, "black", `bar-black-${i}`),
        );
      }
      if (gameState.bar_black > 4) {
        const lastCy = isTop
          ? centerY - CHECKER_RADIUS - 8 - (count - 1) * step
          : centerY + CHECKER_RADIUS + 8 + (count - 1) * step;
        elements.push(
          <g key="bar-black-badge">
            <circle cx={barCx} cy={lastCy} r={10} fill="rgba(0,0,0,0.7)" />
            <text x={barCx} y={lastCy + 4} textAnchor="middle" fill="#fff" fontSize={11} fontWeight="bold">
              {gameState.bar_black}
            </text>
          </g>,
        );
      }
    }

    return elements;
  }

  function renderBearOffCheckers() {
    const elements: JSX.Element[] = [];
    const bearCx = layout.bearoffX + BEAROFF_WIDTH / 2;

    // For White's view: white borne off bottom-right, black borne off top-right
    // For Black's view: black borne off bottom-left, white borne off top-left
    const whiteIsBottom = myColor !== "black";
    const blackIsBottom = myColor === "black";

    // White borne off
    if (gameState.off_white > 0) {
      const isBottom = whiteIsBottom;
      const count = gameState.off_white;
      for (let i = 0; i < count; i++) {
        const cy = isBottom
          ? BOARD_HEIGHT - MARGIN - 6 - i * 8
          : MARGIN + 6 + i * 8;
        elements.push(
          <rect
            key={`off-white-${i}`}
            x={bearCx - 14}
            y={cy - 5}
            width={28}
            height={10}
            rx={3}
            fill={WHITE_CHECKER_FILL}
            stroke={WHITE_CHECKER_STROKE}
            strokeWidth={0.5}
          />,
        );
      }
    }

    // Black borne off
    if (gameState.off_black > 0) {
      const isBottom = blackIsBottom;
      const count = gameState.off_black;
      for (let i = 0; i < count; i++) {
        const cy = isBottom
          ? BOARD_HEIGHT - MARGIN - 6 - i * 8
          : MARGIN + 6 + i * 8;
        elements.push(
          <rect
            key={`off-black-${i}`}
            x={bearCx - 14}
            y={cy - 5}
            width={28}
            height={10}
            rx={3}
            fill={BLACK_CHECKER_FILL}
            stroke={BLACK_CHECKER_STROKE}
            strokeWidth={0.5}
          />,
        );
      }
    }

    return elements;
  }

  function renderPointHighlight(point: number) {
    const pos = pointPositions[point];
    if (!pos) return null;

    let fillColor: string | null = null;
    if (selectedPoint === point) {
      fillColor = HIGHLIGHT_SELECTED;
    } else if (validDestinations.has(point)) {
      fillColor = HIGHLIGHT_DEST;
    } else if (selectedPoint === null && validSourcePoints.has(point)) {
      fillColor = HIGHLIGHT_SOURCE;
    }

    if (!fillColor) return null;

    const cx = columnX(pos.col);
    const halfWidth = POINT_WIDTH / 2 - 2;

    if (pos.isTop) {
      return (
        <polygon
          key={`hl-${point}`}
          points={`${cx - halfWidth},${MARGIN} ${cx + halfWidth},${MARGIN} ${cx},${MARGIN + TRIANGLE_HEIGHT}`}
          fill={fillColor}
          pointerEvents="none"
        />
      );
    }
    return (
      <polygon
        key={`hl-${point}`}
        points={`${cx - halfWidth},${BOARD_HEIGHT - MARGIN} ${cx + halfWidth},${BOARD_HEIGHT - MARGIN} ${cx},${BOARD_HEIGHT - MARGIN - TRIANGLE_HEIGHT}`}
        fill={fillColor}
        pointerEvents="none"
      />
    );
  }

  function renderPointClickArea(point: number) {
    const pos = pointPositions[point];
    if (!pos) return null;

    const cx = columnX(pos.col);
    const halfWidth = POINT_WIDTH / 2;
    const y = pos.isTop ? MARGIN : BOARD_HEIGHT - MARGIN - TRIANGLE_HEIGHT;

    return (
      <rect
        key={`click-${point}`}
        className="point-area"
        x={cx - halfWidth}
        y={y}
        width={POINT_WIDTH}
        height={TRIANGLE_HEIGHT}
        fill="transparent"
        onClick={() => handlePointClick(point)}
      />
    );
  }

  function renderPointLabels() {
    const labels: JSX.Element[] = [];

    for (let point = 1; point <= 24; point++) {
      const pos = pointPositions[point];
      if (!pos) continue;
      const cx = columnX(pos.col);
      const cy = pos.isTop ? MARGIN - 6 : BOARD_HEIGHT - MARGIN + 14;

      labels.push(
        <text
          key={`label-${point}`}
          x={cx}
          y={cy}
          textAnchor="middle"
          fill="#888"
          fontSize={13}
          fontFamily="monospace"
          fontWeight="600"
        >
          {point}
        </text>,
      );
    }

    return labels;
  }

  function renderDoublingCube() {
    const cx = layout.bearoffX + BEAROFF_WIDTH / 2;
    // Position based on ownership: centered if no owner, near owner's side otherwise
    let cy: number;
    if (cubeOwner === null) {
      cy = BOARD_HEIGHT / 2;
    } else if (
      (cubeOwner === "white" && myColor === "white") ||
      (cubeOwner === "black" && myColor === "black")
    ) {
      // Owner is me — show near my side (bottom)
      cy = BOARD_HEIGHT / 2 + 60;
    } else {
      // Owner is opponent — show near their side (top)
      cy = BOARD_HEIGHT / 2 - 60;
    }
    const size = 32;
    const half = size / 2;
    return (
      <g>
        {/* Cube shadow */}
        <rect
          x={cx - half + 2}
          y={cy - half + 2}
          width={size}
          height={size}
          rx={4}
          fill="rgba(0,0,0,0.3)"
        />
        {/* Cube body */}
        <rect
          x={cx - half}
          y={cy - half}
          width={size}
          height={size}
          rx={4}
          fill="#f5f0e1"
          stroke="#8b7355"
          strokeWidth={1.5}
        />
        {/* Top face highlight for 3D effect */}
        <rect
          x={cx - half}
          y={cy - half}
          width={size}
          height={size / 3}
          rx={4}
          fill="rgba(255,255,255,0.15)"
        />
        {/* Cube value */}
        <text
          x={cx}
          y={cy + 1}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#2a1a0e"
          fontSize={cubeValue >= 100 ? 11 : 14}
          fontWeight="bold"
          fontFamily="monospace"
        >
          {cubeValue}
        </text>
      </g>
    );
  }

  // Build the triangles (alternating colors)
  const triangles: JSX.Element[] = [];
  for (let point = 1; point <= 24; point++) {
    const pos = pointPositions[point];
    if (!pos) continue;
    // Use point number to determine color alternation
    triangles.push(
      <g key={`tri-${point}`}>
        {renderTriangle(pos.col, pos.isTop, point)}
      </g>,
    );
  }

  return (
    <div className="board-container">
      <svg
        className="board-svg"
        viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
        width={BOARD_WIDTH}
        height={BOARD_HEIGHT}
      >
        {/* Board background - total width is always the same regardless of orientation */}
        <rect
          x={MARGIN}
          y={MARGIN}
          width={BEAROFF_WIDTH + 12 * POINT_WIDTH + BAR_WIDTH}
          height={BOARD_HEIGHT - 2 * MARGIN}
          rx={6}
          fill={BOARD_BG}
          stroke={BORDER_COLOR}
          strokeWidth={2}
        />

        {/* Bar */}
        <rect
          x={layout.barX}
          y={MARGIN}
          width={BAR_WIDTH}
          height={BOARD_HEIGHT - 2 * MARGIN}
          fill={BAR_FILL}
          stroke={BORDER_COLOR}
          strokeWidth={1}
        />

        {/* Bear-off trough */}
        <rect
          x={layout.bearoffX}
          y={MARGIN}
          width={BEAROFF_WIDTH}
          height={BOARD_HEIGHT - 2 * MARGIN}
          fill={BAR_FILL}
          stroke={BORDER_COLOR}
          strokeWidth={1}
          rx={4}
        />

        {/* Triangles */}
        {triangles}

        {/* Highlights */}
        {Array.from({ length: 24 }, (_, i) => i + 1).map((pt) =>
          renderPointHighlight(pt),
        )}

        {/* Bar highlight */}
        {(barIsSource || barIsSelected) && (
          <rect
            x={layout.barX + 2}
            y={MARGIN + 2}
            width={BAR_WIDTH - 4}
            height={BOARD_HEIGHT - 2 * MARGIN - 4}
            fill={barIsSelected ? HIGHLIGHT_SELECTED : HIGHLIGHT_SOURCE}
            rx={4}
            pointerEvents="none"
          />
        )}

        {/* Bear-off highlight */}
        {bearOffIsDestination && (
          <rect
            x={layout.bearoffX + 2}
            y={MARGIN + 2}
            width={BEAROFF_WIDTH - 4}
            height={BOARD_HEIGHT - 2 * MARGIN - 4}
            fill={HIGHLIGHT_DEST}
            rx={4}
            pointerEvents="none"
          />
        )}

        {/* Checkers on points */}
        {Array.from({ length: 24 }, (_, i) => i + 1).map((pt) =>
          renderCheckersOnPoint(pt),
        )}

        {/* Bar checkers */}
        {renderBarCheckers()}

        {/* Bear-off checkers */}
        {renderBearOffCheckers()}

        {/* Point labels */}
        {renderPointLabels()}

        {/* Click areas for points */}
        {Array.from({ length: 24 }, (_, i) => i + 1).map((pt) =>
          renderPointClickArea(pt),
        )}

        {/* Bar click area */}
        <rect
          className="bar-area"
          x={layout.barX}
          y={MARGIN}
          width={BAR_WIDTH}
          height={BOARD_HEIGHT - 2 * MARGIN}
          fill="transparent"
          onClick={onBarClick}
        />

        {/* Bear-off click area */}
        <rect
          className="bearoff-area"
          x={layout.bearoffX}
          y={MARGIN}
          width={BEAROFF_WIDTH}
          height={BOARD_HEIGHT - 2 * MARGIN}
          fill="transparent"
          onClick={onBearOffClick}
        />

        {/* "BAR" label */}
        <text
          x={layout.barX + BAR_WIDTH / 2}
          y={BOARD_HEIGHT / 2}
          textAnchor="middle"
          fill="#888"
          fontSize={10}
          fontFamily="monospace"
          transform={`rotate(-90, ${layout.barX + BAR_WIDTH / 2}, ${BOARD_HEIGHT / 2})`}
          pointerEvents="none"
        >
          BAR
        </text>

        {/* Doubling cube */}
        {renderDoublingCube()}
      </svg>
    </div>
  );
}

export default Board;
