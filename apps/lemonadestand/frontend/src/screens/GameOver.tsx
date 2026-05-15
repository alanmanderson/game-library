import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RotateCcw, Home, Trophy, Calendar, DollarSign, Users, Coffee, Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import { useGameStore } from '@/stores/gameStore';
import { formatCurrency, formatNumber } from '@/utils/format';
import { StageNames } from '@/types/game';
import LemonadeStandGraphic from '@/components/LemonadeStandGraphic';

export default function GameOver() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);
  const [loading, setLoading] = useState(!game);

  const loadGame = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const gameState = await api.getGame(id);
      setGame(gameState);
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id, setGame, navigate]);

  useEffect(() => {
    if (!game || game.id !== id) {
      loadGame();
    } else {
      setLoading(false);
    }
  }, [game, id, loadGame]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-500" size={48} />
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <button onClick={() => navigate('/')} className="btn-primary">Back to Menu</button>
      </div>
    );
  }

  const totalProfit = game.totalRevenue - game.totalExpenses;

  const stats = [
    { label: 'Days Played', value: game.day.toString(), icon: <Calendar size={20} className="text-blue-500" />, bg: 'bg-blue-50' },
    { label: 'Total Revenue', value: formatCurrency(game.totalRevenue), icon: <DollarSign size={20} className="text-green-500" />, bg: 'bg-green-50' },
    { label: 'Total Profit', value: formatCurrency(totalProfit), icon: <Trophy size={20} className="text-amber-500" />, bg: 'bg-amber-50' },
    { label: 'Cups Sold', value: formatNumber(game.cupsSold), icon: <Coffee size={20} className="text-orange-500" />, bg: 'bg-orange-50' },
    { label: 'Customers Served', value: formatNumber(game.customersServed), icon: <Users size={20} className="text-purple-500" />, bg: 'bg-purple-50' },
    { label: 'Final Stage', value: StageNames[game.stage] ?? `Stage ${game.stage}`, icon: <Trophy size={20} className="text-pink-500" />, bg: 'bg-pink-50' },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <h1 className="text-4xl sm:text-5xl font-bold text-amber-800 mb-2">Game Over</h1>
        {game.gameOverReason && (
          <p className="text-ink-light text-sm max-w-md mx-auto">{game.gameOverReason}</p>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-6"
      >
        <LemonadeStandGraphic size="md" animated={false} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="game-card max-w-lg w-full mb-6"
      >
        <h3 className="font-bold text-ink text-center mb-4 text-lg">
          {game.playerName}&apos;s Empire Stats
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className={`${stat.bg} rounded-xl p-3 text-center`}
            >
              <div className="flex justify-center mb-1">{stat.icon}</div>
              <div className="font-bold text-ink text-sm">{stat.value}</div>
              <div className="text-xs text-ink-light">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Achievements */}
        {game.achievements.filter((a) => a.isUnlocked).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h4 className="text-sm font-bold text-ink mb-2">Achievements Earned</h4>
            <div className="flex flex-wrap gap-2">
              {game.achievements
                .filter((a) => a.isUnlocked)
                .map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2 py-1 text-xs font-medium text-amber-800"
                  >
                    {a.icon} {a.name}
                  </span>
                ))}
            </div>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex gap-3"
      >
        <button onClick={() => navigate('/')} className="btn-secondary">
          <Home size={16} />
          Main Menu
        </button>
        <button
          onClick={() => {
            setGame(null);
            navigate('/');
          }}
          className="btn-primary"
        >
          <RotateCcw size={16} />
          Play Again
        </button>
      </motion.div>
    </div>
  );
}
