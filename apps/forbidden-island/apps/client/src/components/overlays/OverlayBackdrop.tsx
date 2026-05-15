import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';

interface OverlayBackdropProps {
  children: ReactNode;
  blur?: number;
  opacity?: number;
  onClick?: () => void;
  style?: CSSProperties;
}

/**
 * Full-screen dimmed backdrop used by all overlay modals.
 * Fades in via Framer Motion. Clicking the backdrop can optionally close it.
 */
export function OverlayBackdrop({
  children,
  blur = 2,
  opacity = 0.6,
  onClick,
  style,
}: OverlayBackdropProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {/* Dim layer */}
      <div
        onClick={onClick}
        style={{
          position: 'absolute',
          inset: 0,
          background: `rgba(8, 22, 28, ${opacity})`,
          backdropFilter: blur > 0 ? `blur(${blur}px)` : undefined,
        }}
      />
      {/* Content sits above the dim layer */}
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{ position: 'relative', zIndex: 1 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
