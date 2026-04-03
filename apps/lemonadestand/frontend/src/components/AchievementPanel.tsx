import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, ChevronDown, ChevronRight } from 'lucide-react';
import type { Achievement } from '@/types/game';

interface AchievementPanelProps {
  achievements: Achievement[];
}

export default function AchievementPanel({ achievements }: AchievementPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const unlocked = achievements.filter((a) => a.isUnlocked);
  const locked = achievements.filter((a) => !a.isUnlocked);

  return (
    <div className="game-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Award size={20} className="text-amber-600" />
          <h3 className="font-bold text-ink">Achievements</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-amber-600 bg-amber-100 rounded-full px-2 py-0.5">
            {unlocked.length}/{achievements.length}
          </span>
          {isExpanded ? (
            <ChevronDown size={16} className="text-ink-light" />
          ) : (
            <ChevronRight size={16} className="text-ink-light" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4">
              {achievements.length === 0 ? (
                <div className="text-center py-6 text-ink-light text-sm">
                  Keep playing to earn achievements!
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {unlocked.map((a) => (
                    <motion.div
                      key={a.id}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-center bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-3"
                    >
                      <div className="text-3xl mb-1">{a.icon}</div>
                      <div className="text-xs font-bold text-amber-800 leading-tight">{a.name}</div>
                      <div className="text-[10px] text-amber-600 mt-0.5">{a.description}</div>
                    </motion.div>
                  ))}
                  {locked.map((a) => (
                    <div
                      key={a.id}
                      className="text-center bg-gray-50 border border-gray-200 rounded-xl p-3 opacity-50"
                    >
                      <div className="text-3xl mb-1 grayscale">{a.icon || '\uD83D\uDD12'}</div>
                      <div className="text-xs font-bold text-gray-500 leading-tight">{a.name}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{a.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
