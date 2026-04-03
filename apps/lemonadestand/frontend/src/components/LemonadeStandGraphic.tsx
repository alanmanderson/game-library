import { motion } from 'framer-motion';

interface LemonadeStandGraphicProps {
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export default function LemonadeStandGraphic({ size = 'md', animated = true }: LemonadeStandGraphicProps) {
  const scale = size === 'sm' ? 0.5 : size === 'lg' ? 1.4 : 1;

  return (
    <div
      className="relative select-none"
      style={{ width: 200 * scale, height: 220 * scale, transform: `scale(${scale})`, transformOrigin: 'center center' }}
    >
      {/* Stand base / counter */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2"
        style={{
          width: 180,
          height: 60,
          background: 'linear-gradient(180deg, #D97706 0%, #B45309 100%)',
          borderRadius: '8px 8px 12px 12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
      >
        {/* Wood grain lines */}
        <div className="absolute top-3 left-4 right-4 h-[1px] bg-amber-900/20" />
        <div className="absolute top-6 left-6 right-8 h-[1px] bg-amber-900/15" />
        <div className="absolute bottom-4 left-3 right-5 h-[1px] bg-amber-900/15" />
      </div>

      {/* Left pole */}
      <div
        className="absolute bottom-[56px] left-[22px]"
        style={{
          width: 10,
          height: 120,
          background: 'linear-gradient(90deg, #92400E, #B45309, #92400E)',
          borderRadius: '3px 3px 0 0',
        }}
      />

      {/* Right pole */}
      <div
        className="absolute bottom-[56px] right-[22px]"
        style={{
          width: 10,
          height: 120,
          background: 'linear-gradient(90deg, #92400E, #B45309, #92400E)',
          borderRadius: '3px 3px 0 0',
        }}
      />

      {/* Roof / awning */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2"
        style={{
          width: 200,
          height: 50,
          background: 'linear-gradient(180deg, #FCD34D 0%, #F59E0B 100%)',
          borderRadius: '12px 12px 4px 4px',
          boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
        }}
      >
        {/* Scalloped edge */}
        <div className="absolute -bottom-2 left-0 right-0 flex justify-around">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="w-4 h-4 rounded-full"
              style={{
                background: i % 2 === 0 ? '#FCD34D' : '#FBBF24',
                marginTop: '-6px',
              }}
            />
          ))}
        </div>
      </div>

      {/* Sign */}
      <div
        className="absolute top-[12px] left-1/2 -translate-x-1/2 z-10"
        style={{
          fontFamily: "'Fredoka', sans-serif",
          fontWeight: 700,
          fontSize: '11px',
          color: '#92400E',
          textAlign: 'center',
          letterSpacing: '-0.3px',
          lineHeight: 1.1,
        }}
      >
        LEMONADE
        <div style={{ fontSize: '7px', fontWeight: 600, color: '#B45309' }}>FRESH &amp; COLD</div>
      </div>

      {/* Pitcher */}
      <motion.div
        className="absolute bottom-[58px] left-1/2 -translate-x-1/2"
        animate={animated ? { rotate: [0, -2, 2, 0] } : {}}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ marginLeft: -25 }}
      >
        <div
          style={{
            width: 36,
            height: 44,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
            borderRadius: '4px 4px 8px 8px',
            border: '2px solid rgba(200,200,200,0.5)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Lemonade liquid */}
          <motion.div
            animate={animated ? { height: ['65%', '70%', '65%'] } : {}}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '68%',
              background: 'linear-gradient(180deg, #FDE68A 0%, #FCD34D 50%, #F59E0B 100%)',
              borderRadius: '0 0 6px 6px',
            }}
          />
          {/* Ice cubes */}
          <motion.div
            animate={animated ? { y: [0, -2, 1, 0], rotate: [0, 5, -3, 0] } : {}}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-[30%] left-[6px]"
            style={{
              width: 8,
              height: 7,
              background: 'rgba(255,255,255,0.8)',
              borderRadius: 2,
              border: '1px solid rgba(200,220,240,0.5)',
            }}
          />
          <motion.div
            animate={animated ? { y: [0, 1, -2, 0], rotate: [0, -4, 3, 0] } : {}}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            className="absolute top-[28%] right-[5px]"
            style={{
              width: 7,
              height: 6,
              background: 'rgba(255,255,255,0.7)',
              borderRadius: 2,
              border: '1px solid rgba(200,220,240,0.4)',
            }}
          />
          {/* Handle */}
          <div
            className="absolute top-[8px] -right-[8px]"
            style={{
              width: 10,
              height: 22,
              borderRadius: '0 8px 8px 0',
              border: '2px solid rgba(200,200,200,0.5)',
              borderLeft: 'none',
            }}
          />
        </div>
      </motion.div>

      {/* Cup */}
      <motion.div
        className="absolute bottom-[58px]"
        style={{ right: 36 }}
        animate={animated ? { y: [0, -3, 0] } : {}}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      >
        <div
          style={{
            width: 22,
            height: 28,
            background: 'white',
            borderRadius: '2px 2px 4px 4px',
            border: '2px solid #E5E7EB',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '60%',
              background: 'linear-gradient(180deg, #FDE68A 0%, #FCD34D 100%)',
              borderRadius: '0 0 2px 2px',
            }}
          />
        </div>
      </motion.div>

      {/* Lemon slice decoration */}
      <motion.div
        className="absolute bottom-[56px] left-[32px]"
        animate={animated ? { rotate: [0, 10, -5, 0] } : {}}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #FEF3C7 30%, #FCD34D 60%, #F59E0B 100%)',
            border: '2px solid #F59E0B',
          }}
        />
      </motion.div>

      {/* Price tag */}
      <div
        className="absolute bottom-[22px] left-1/2 -translate-x-1/2 bg-white rounded-md px-3 py-1 shadow-sm"
        style={{
          fontFamily: "'Fredoka', sans-serif",
          fontWeight: 700,
          fontSize: '12px',
          color: '#059669',
          border: '1px solid #D1FAE5',
        }}
      >
        OPEN!
      </div>
    </div>
  );
}
