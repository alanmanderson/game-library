interface CrackOverlayProps {
  severity?: number;
  color?: string;
}

// Primary crack networks — jagged, branching fractures
const CRACK_MAIN = [
  // Large diagonal crack across tile
  'M8 18 Q14 22 18 30 Q22 38 30 42 Q38 48 42 55 Q48 62 55 68 Q62 74 72 78 Q80 82 88 88',
  // Branch from main crack
  'M30 42 Q34 50 28 58 Q22 66 18 78',
  // Second major crack
  'M92 12 Q84 20 78 28 Q72 36 65 42 Q58 48 52 58',
  // Small branch
  'M65 42 Q70 52 78 58 Q86 64 94 72',
  // Third crack from bottom-left
  'M4 72 Q12 68 20 62 Q28 56 36 52',
  // Fine hairline crack
  'M48 8 Q52 18 50 28 Q48 38 52 48',
];

// Secondary detail cracks — thinner, shorter fragments
const CRACK_DETAIL = [
  'M42 55 Q46 60 44 66',
  'M78 28 Q82 34 86 32',
  'M18 30 Q12 34 8 32',
  'M52 58 Q56 64 62 66',
];

export function CrackOverlay({ severity = 1, color = 'rgba(8,22,28,.8)' }: CrackOverlayProps) {
  // Show more crack lines at higher severity
  const mainCount = 2 + Math.round(severity * 4);
  const detailCount = Math.round(severity * 4);
  const mainLines = CRACK_MAIN.slice(0, mainCount);
  const detailLines = CRACK_DETAIL.slice(0, detailCount);

  const baseWidth = 1.6 + severity * 1.8;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: 0.55 + 0.45 * severity,
      }}
    >
      {/* Main crack lines */}
      {mainLines.map((d, i) => (
        <path
          key={`m${i}`}
          d={d}
          stroke={color}
          strokeWidth={baseWidth - i * 0.15}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* Thinner detail cracks */}
      {detailLines.map((d, i) => (
        <path
          key={`d${i}`}
          d={d}
          stroke={color}
          strokeWidth={baseWidth * 0.5}
          fill="none"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
