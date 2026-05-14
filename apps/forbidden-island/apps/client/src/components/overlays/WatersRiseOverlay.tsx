import { motion } from 'framer-motion';
import { Frame } from '../ui/Frame';
import { Button } from '../ui/Button';
import { TreasureCard } from '../cards/TreasureCard';
import { WaterMeter } from '../status/WaterMeter';
import { useStore } from '../../store/store';
import { OverlayBackdrop } from './OverlayBackdrop';

export function WatersRiseOverlay() {
  const overlayData = useStore((s) => s.overlayData);
  const closeOverlay = useStore((s) => s.closeOverlay);

  const newLevel = overlayData.newWaterLevel ?? 4;
  const oldLevel = overlayData.oldWaterLevel ?? Math.max(1, newLevel - 1);

  return (
    <OverlayBackdrop opacity={0.7}>
      {/* Red wash gradient */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(60% 50% at 50% 50%, rgba(201,82,58,.25) 0%, transparent 80%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 30 }}>
        {/* Waters Rise card, tilted */}
        <motion.div
          initial={{ rotate: 0, y: 30, opacity: 0 }}
          animate={{ rotate: -4, y: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <TreasureCard type="waters_rise" width={210} height={300} glow />
        </motion.div>

        {/* Info panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div className="fi-cap" style={{ color: '#f0a89a' }}>
              Hazard Resolved
            </div>
            <div
              className="fi-display"
              style={{ fontSize: 36, color: 'var(--c-parch)', marginTop: 6 }}
            >
              The waters{' '}
              <span className="fi-display-i" style={{ color: '#f0a89a' }}>
                rise
              </span>
              .
            </div>
          </div>

          <Frame tone="ink2" padded={false} style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 18 }}>
            <WaterMeter level={newLevel} compact />
            <div>
              <div
                className="fi-mono"
                style={{
                  fontSize: 10,
                  color: 'var(--c-sand2)',
                  letterSpacing: '.12em',
                }}
              >
                WATER LEVEL - {oldLevel} &rarr; {newLevel}
              </div>
              <div
                className="fi-display"
                style={{
                  fontSize: 22,
                  color: 'var(--c-brassHi)',
                  marginTop: 4,
                }}
              >
                Draw {newLevel >= 7 ? 5 : newLevel >= 5 ? 4 : newLevel >= 3 ? 3 : 2} flood cards / turn
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--c-sand)',
                  marginTop: 6,
                  maxWidth: 280,
                  lineHeight: 1.5,
                }}
              >
                All flood discards have been shuffled and stacked on top of the
                flood deck. Previously sunk tiles cannot return.
              </div>
            </div>
          </Frame>

          <div style={{ display: 'flex', gap: 10 }}>
            <div
              className="fi-mono"
              style={{
                fontSize: 10,
                color: 'var(--c-sand2)',
                letterSpacing: '.12em',
                padding: '6px 0',
              }}
            >
              AUTO-RESUMING DRAW PHASE...
            </div>
            <div style={{ flex: 1 }} />
            <Button kind="ghost" size="sm" onClick={closeOverlay}>
              Continue
            </Button>
          </div>
        </div>
      </div>
    </OverlayBackdrop>
  );
}
