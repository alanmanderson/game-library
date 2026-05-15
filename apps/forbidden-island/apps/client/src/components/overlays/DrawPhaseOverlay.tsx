import { motion } from 'framer-motion';
import { CardBack } from '../cards/CardBack';
import { TreasureCard } from '../cards/TreasureCard';
import { FloodCard } from '../cards/FloodCard';
import { useStore } from '../../store/store';
import { TILES_BY_ID } from '../../data/tiles';

interface DrawPhaseOverlayProps {
  mode: 'treasure' | 'flood';
}

export function DrawPhaseOverlay({ mode }: DrawPhaseOverlayProps) {
  const overlayData = useStore((s) => s.overlayData);
  const gameState = useStore((s) => s.gameState);
  const waterLevel = gameState?.waterLevel ?? 2;

  if (mode === 'treasure') {
    return <TreasureDrawReveal drawnCards={overlayData.drawnCards ?? []} />;
  }

  return (
    <FloodDrawReveal
      floodReveals={overlayData.floodReveals ?? []}
      floodCardCount={waterLevel >= 7 ? 5 : waterLevel >= 5 ? 4 : waterLevel >= 3 ? 3 : 2}
    />
  );
}

function TreasureDrawReveal({
  drawnCards,
}: {
  drawnCards: Array<{ type: string; id?: string; isWatersRise?: boolean }>;
}) {
  const totalToDraw = 2;
  const remaining = totalToDraw - drawnCards.length;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(8,22,28,.55)',
          backdropFilter: 'blur(2px)',
        }}
      />
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div className="fi-cap" style={{ color: 'var(--c-brassHi)' }}>
          Draw 2 Treasure Cards
        </div>
        <div className="fi-display" style={{ fontSize: 26, color: 'var(--c-parch)', marginTop: 4 }}>
          {drawnCards.length === 0 ? 'Drawing from the deck...' : `${drawnCards.length} of ${totalToDraw} drawn`}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 18,
            marginTop: 18,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Undrawn cards as card backs */}
          {remaining > 0 && (
            <CardBack width={120} height={170} />
          )}

          {/* Drawn cards */}
          <div style={{ display: 'flex', gap: 14 }}>
            {drawnCards.map((card, i) => (
              <motion.div
                key={card.id ?? `drawn-${i}`}
                initial={{ rotateY: 180, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ duration: 0.4, delay: i * 0.3 }}
                style={{
                  transform: `translateY(${i % 2 === 0 ? -8 : 0}px) rotate(${i % 2 === 0 ? -4 : 3}deg)`,
                }}
              >
                <TreasureCard
                  type={card.type}
                  width={120}
                  height={170}
                  glow
                />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Waters Rise warning */}
        {drawnCards.some((c) => c.isWatersRise) && (
          <div
            className="fi-mono"
            style={{
              marginTop: 10,
              fontSize: 10,
              color: 'var(--c-danger)',
              letterSpacing: '.15em',
            }}
          >
            WATERS RISE! CARD DRAWN
          </div>
        )}
      </div>
    </div>
  );
}

function FloodDrawReveal({
  floodReveals,
  floodCardCount,
}: {
  floodReveals: Array<{ tileId: string; tileName: string; newState: string }>;
  floodCardCount: number;
}) {
  const sunkTiles = floodReveals.filter((r) => r.newState === 'sunk');

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(8,22,28,.55)',
          backdropFilter: 'blur(2px)',
        }}
      />
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div className="fi-cap" style={{ color: 'var(--c-seaHi)' }}>
          Draw {floodCardCount} Flood Cards
        </div>
        <div className="fi-display" style={{ fontSize: 26, color: 'var(--c-parch)', marginTop: 4 }}>
          {floodReveals.length === 0 ? 'The tide rises...' : `${floodReveals.length} of ${floodCardCount} revealed`}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 14,
            marginTop: 18,
            alignItems: 'center',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          {floodReveals.map((reveal, i) => {
            // Find the tile ID from the tileName (flood card references tile by name)
            // The tileId from the reveal may be a name; look it up
            const tileDef = Object.values(TILES_BY_ID).find(
              (t) => t.name === reveal.tileName || t.id === reveal.tileId
            );
            const tileId = tileDef?.id ?? reveal.tileId;
            const isSunk = reveal.newState === 'sunk';
            return (
              <motion.div
                key={tileId + '-' + i}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: i * 0.2 }}
              >
                <FloodCard
                  tileId={tileId}
                  width={110}
                  height={150}
                  glow={i === floodReveals.length - 1}
                  sunk={isSunk}
                />
              </motion.div>
            );
          })}
        </div>

        {sunkTiles.length > 0 && (
          <div
            className="fi-mono"
            style={{ marginTop: 10, fontSize: 10, color: 'var(--c-danger)', letterSpacing: '.15em' }}
          >
            {sunkTiles
              .map((t) => {
                const tileDef = Object.values(TILES_BY_ID).find(
                  (td) => td.name === t.tileName || td.id === t.tileId
                );
                return (tileDef?.name ?? t.tileName).toUpperCase();
              })
              .join(', ')}{' '}
            {sunkTiles.length === 1 ? 'WAS ALREADY FLOODED -- IT SINKS' : 'WERE ALREADY FLOODED -- THEY SINK'}
          </div>
        )}
      </div>
    </div>
  );
}
