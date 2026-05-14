interface CrackOverlayProps {
  severity?: number;
  color?: string;
}

const ALL_LINES = [
  'M10 50 L40 35 L55 60 L80 40 L120 70',
  'M55 60 L70 90',
  'M40 35 L20 10',
  'M80 40 L100 15',
];

export function CrackOverlay({ severity = 1, color = 'rgba(8,22,28,.8)' }: CrackOverlayProps) {
  const count = 2 + Math.round(severity * 2);
  const lines = ALL_LINES.slice(0, count);

  return (
    <svg
      viewBox="0 0 120 100"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: 0.6 + 0.4 * severity,
      }}
    >
      {lines.map((d, i) => (
        <path
          key={i}
          d={d}
          stroke={color}
          strokeWidth={1.4 + severity}
          fill="none"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
