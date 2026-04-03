import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, Zap } from 'lucide-react';
import type { GameEvent } from '@/types/game';

interface EventBannerProps {
  events: GameEvent[];
}

function getEventStyle(type: string) {
  switch (type) {
    case 'Info': return { bg: 'bg-blue-50 border-blue-200', icon: <Info size={18} className="text-blue-500" />, text: 'text-blue-800' };
    case 'Positive': return { bg: 'bg-green-50 border-green-200', icon: <Zap size={18} className="text-green-500" />, text: 'text-green-800' };
    case 'Warning': return { bg: 'bg-amber-50 border-amber-200', icon: <AlertTriangle size={18} className="text-amber-500" />, text: 'text-amber-800' };
    case 'Negative': return { bg: 'bg-red-50 border-red-200', icon: <AlertTriangle size={18} className="text-red-500" />, text: 'text-red-800' };
    default: return { bg: 'bg-gray-50 border-gray-200', icon: <Info size={18} className="text-gray-500" />, text: 'text-gray-800' };
  }
}

export default function EventBanner({ events }: EventBannerProps) {
  const activeEvents = events.filter((e) => e.isActive);
  if (activeEvents.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence>
        {activeEvents.map((event, i) => {
          const style = getEventStyle(event.type);
          return (
            <motion.div
              key={`event-${i}-${event.title}`}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${style.bg}`}
            >
              <span className="mt-0.5 shrink-0">{style.icon}</span>
              <div className="flex-1 min-w-0">
                <div className={`font-bold text-sm ${style.text}`}>{event.title}</div>
                <div className={`text-xs mt-0.5 ${style.text} opacity-80`}>{event.description}</div>
                {event.duration > 0 && (
                  <div className="text-xs mt-1 opacity-60">
                    Duration: {event.duration} day{event.duration !== 1 ? 's' : ''} | Impact: {event.impactMultiplier.toFixed(1)}x
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
