import { Compass } from './Compass';

type BrandSize = 'sm' | 'md' | 'lg' | 'xl';

interface BrandMarkProps {
  size?: BrandSize;
}

const SIZES: Record<BrandSize, { title: number; kicker: number; compass: number }> = {
  sm: { title: 18, kicker: 9, compass: 24 },
  md: { title: 28, kicker: 10, compass: 34 },
  lg: { title: 46, kicker: 11, compass: 54 },
  xl: { title: 68, kicker: 13, compass: 76 },
};

export function BrandMark({ size = 'lg' }: BrandMarkProps) {
  const s = SIZES[size];
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
      <Compass size={s.compass} color="var(--c-brassHi)" />
      <div>
        <div
          className="fi-mono"
          style={{
            fontSize: s.kicker,
            letterSpacing: '.32em',
            color: 'var(--c-brass)',
            marginBottom: 2,
          }}
        >
          A CO-OP EXPEDITION
        </div>
        <div
          className="fi-display"
          style={{
            fontSize: s.title,
            color: 'var(--c-parch)',
            lineHeight: 1,
            letterSpacing: '-.005em',
          }}
        >
          Forbidden <span className="fi-display-i">Island</span>
        </div>
      </div>
    </div>
  );
}
