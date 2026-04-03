import { DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/stores/gameStore';
import { formatCurrency } from '@/utils/format';
import StarRating from './StarRating';
import WeatherDisplay from './WeatherDisplay';
import { StageNames } from '@/types/game';

export default function Header() {
  const game = useGameStore((s) => s.game);
  const latestResult = useGameStore((s) => s.lastDayResult);
  if (!game) return null;

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-amber-100 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex flex-wrap items-center gap-4 justify-between">
          {/* Player & Stage */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-lemon to-lemon-dark flex items-center justify-center text-white font-bold text-lg shadow-md">
              {game.playerName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-bold text-ink text-sm leading-tight">{game.playerName}</div>
              <div className="text-xs text-amber-600 font-semibold">{StageNames[game.stage] ?? `Stage ${game.stage}`}</div>
            </div>
          </div>

          {/* Cash */}
          <motion.div
            key={game.cash}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2"
          >
            <DollarSign size={18} className="text-green-600" />
            <div>
              <div className="text-xs text-green-600 font-medium">Cash</div>
              <div className="font-bold text-green-800 text-lg leading-tight">{formatCurrency(game.cash)}</div>
            </div>
          </motion.div>

          {/* Day */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
            <Calendar size={18} className="text-blue-600" />
            <div>
              <div className="text-xs text-blue-600 font-medium">Day</div>
              <div className="font-bold text-blue-800 text-lg leading-tight">{game.day}</div>
            </div>
          </div>

          {/* Reputation */}
          <div className="hidden sm:flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
            <div>
              <div className="text-xs text-amber-600 font-medium mb-0.5">Reputation</div>
              <StarRating rating={game.reputation} size={16} />
            </div>
          </div>

          {/* Weather */}
          {latestResult && (
            <WeatherDisplay weather={latestResult.weather} temperature={latestResult.temperature} />
          )}

          {/* Profit indicator */}
          <div className="hidden md:flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl px-4 py-2">
            <TrendingUp size={18} className="text-purple-600" />
            <div>
              <div className="text-xs text-purple-600 font-medium">Profit</div>
              <div className="font-bold text-purple-800 leading-tight">
                {formatCurrency(game.totalRevenue - game.totalExpenses)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
