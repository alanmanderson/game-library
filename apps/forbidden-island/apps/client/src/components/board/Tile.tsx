import type { CSSProperties, ReactNode, MouseEventHandler } from 'react';
import { TILES_BY_ID } from '../../data/tiles';
import { TileGlyph } from './TileGlyph';
import { TreasureMark } from './TreasureMark';
import { CrackOverlay } from './CrackOverlay';

const PAPER_GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.8' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.25'/></svg>\")";

export type TileTarget = 'move' | 'shore' | 'fly' | 'swim' | 'give' | null;

interface TileProps {
  id: string;
  state?: 'normal' | 'flooded' | 'sunk';
  size?: number;
  target?: TileTarget;
  selected?: boolean;
  pawns?: ReactNode[];
  showName?: boolean;
  captured?: boolean;
  danger?: boolean;
  dim?: boolean;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

const TARGET_GLOW: Record<string, string> = {
  move: '0 0 0 2px var(--c-leaf), 0 0 24px rgba(94,138,58,.6)',
  shore: '0 0 0 2px var(--c-brassHi), 0 0 24px rgba(232,196,122,.6)',
  fly: '0 0 0 2px var(--c-seaHi), 0 0 30px rgba(58,151,168,.7)',
  swim: '0 0 0 2px var(--c-flame), 0 0 28px rgba(224,113,64,.7)',
  give: '0 0 0 2px #d6c4e8, 0 0 24px rgba(214,196,232,.5)',
};

export function Tile({
  id, state = 'normal', size = 110, target, selected, pawns = [],
  showName = true, captured, danger, dim, style, onClick,
}: TileProps) {
  const t = TILES_BY_ID[id];
  if (!t) return null;

  const isSunk = state === 'sunk';
  const isFlooded = state === 'flooded';

  return (
    <div
      onClick={onClick}
      style={{
        width: size, height: size,
        position: 'relative',
        borderRadius: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform .15s, box-shadow .2s',
        transform: isFlooded ? 'rotate(-1.2deg)' : 'none',
        ...style,
      }}
    >
      {isSunk ? (
        /* SUNK CELL: empty ocean with cracked rim */
        <div style={{
          width: '100%', height: '100%', borderRadius: 10,
          background: 'radial-gradient(80% 80% at 50% 50%, var(--c-ink) 0%, var(--c-ink2) 70%, transparent 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(202,160,82,.18), inset 0 6px 16px rgba(0,0,0,.55)',
          position: 'relative', overflow: 'hidden',
        }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.4 }}>
            <path d="M10 40 Q25 30 50 40 T90 40" stroke="rgba(58,151,168,.6)" strokeWidth=".8" fill="none" />
            <path d="M10 60 Q25 50 50 60 T90 60" stroke="rgba(58,151,168,.4)" strokeWidth=".8" fill="none" />
            <path d="M10 78 Q25 68 50 78 T90 78" stroke="rgba(58,151,168,.3)" strokeWidth=".8" fill="none" />
          </svg>
          <CrackOverlay severity={1} color="rgba(202,160,82,.5)" />
          <div className="fi-mono" style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: 'rgba(202,160,82,.5)', letterSpacing: '.15em' }}>
            SUNK
          </div>
        </div>
      ) : (
        <>
          {/* Painted ground */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden',
            background: `radial-gradient(130% 100% at 30% 20%, ${t.hue1} 0%, ${t.hue2} 90%)`,
            boxShadow: `inset 0 0 0 1px rgba(202,160,82,${selected ? 0.8 : 0.35}), inset 0 1px 0 rgba(255,255,255,.08), inset 0 -16px 30px rgba(0,0,0,.35)`,
            filter: dim ? 'saturate(.4) brightness(.6)' : 'none',
          }}>
            {/* atmospheric haze */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(150% 60% at 50% 110%, rgba(255,240,210,.18) 0%, transparent 60%)' }} />
            {/* paper texture */}
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: PAPER_GRAIN, mixBlendMode: 'overlay', opacity: 0.6 }} />
            {/* glyph */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TileGlyph kind={t.glyph} size={Math.round(size * 0.42)} />
            </div>
            {/* flood blue wash */}
            {isFlooded && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(180deg, rgba(58,151,168,.25) 0%, rgba(26,77,90,.65) 100%)',
                mixBlendMode: 'multiply',
              }}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.7 }}>
                  <path d="M-5 75 Q15 65 35 75 T75 75 T115 75" stroke="rgba(150,210,220,.7)" strokeWidth=".8" fill="none" />
                  <path d="M-5 85 Q15 75 35 85 T75 85 T115 85" stroke="rgba(150,210,220,.5)" strokeWidth=".8" fill="none" />
                </svg>
              </div>
            )}
            {isFlooded && <CrackOverlay severity={0.4} />}

            {/* gate badge */}
            {t.gate && (
              <div style={{ position: 'absolute', top: 5, left: 6 }}>
                <span style={{
                  fontFamily: 'var(--ff-mono)', fontSize: 8, letterSpacing: '.1em', padding: '1px 5px',
                  borderRadius: 3, background: 'rgba(8,22,28,.5)', color: 'var(--c-sand)',
                  border: '1px solid rgba(202,160,82,.4)', textTransform: 'uppercase',
                }}>{t.gate}</span>
              </div>
            )}
            {/* treasure marker */}
            {t.treasure && (
              <div style={{ position: 'absolute', top: 5, right: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
                <TreasureMark treasure={t.treasure} captured={captured} size={14} />
              </div>
            )}
            {/* helipad marker */}
            {t.special === 'landing' && (
              <div style={{ position: 'absolute', top: 5, right: 6 }}>
                <span className="fi-mono" style={{ fontSize: 8, letterSpacing: '.1em', color: 'var(--c-ink)', padding: '1px 4px', background: 'var(--c-brassHi)', borderRadius: 3, fontWeight: 600 }}>HELIPAD</span>
              </div>
            )}
            {/* danger pulse */}
            {danger && (
              <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 2px var(--c-danger), inset 0 0 22px rgba(201,82,58,.5)', borderRadius: 10, animation: 'fi-pulse 1.4s ease-in-out infinite' }} />
            )}
          </div>

          {/* tile name */}
          {showName && (
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 6,
              textAlign: 'center', padding: '0 6px',
              fontFamily: 'var(--ff-display)', fontSize: Math.max(9, Math.round(size * 0.105)),
              fontStyle: 'italic', color: 'rgba(255,240,210,.95)',
              textShadow: '0 1px 2px rgba(0,0,0,.7), 0 0 8px rgba(0,0,0,.4)',
              lineHeight: 1.05, letterSpacing: '.01em',
            }}>{t.name}</div>
          )}

          {/* target highlight */}
          {target && (
            <div style={{
              position: 'absolute', inset: -3, borderRadius: 12,
              boxShadow: TARGET_GLOW[target],
              pointerEvents: 'none',
              animation: 'fi-glow 1.6s ease-in-out infinite',
            }} />
          )}
        </>
      )}

      {/* pawn cluster */}
      {pawns.length > 0 && (
        <div style={{ position: 'absolute', bottom: -8, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 2 }}>
          {pawns.map((p, i) => (
            <div key={i} style={{ marginLeft: i === 0 ? 0 : -8 }}>{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}
