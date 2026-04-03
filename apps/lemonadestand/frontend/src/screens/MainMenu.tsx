import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, FolderOpen, Trash2, Info, Loader2, X } from 'lucide-react';
import { api } from '@/services/api';
import { useGameStore } from '@/stores/gameStore';
import LemonadeStandGraphic from '@/components/LemonadeStandGraphic';
import { formatCurrency } from '@/utils/format';
import { StageNames } from '@/types/game';
import type { GameListItem } from '@/types/game';

export default function MainMenu() {
  const navigate = useNavigate();
  const setGame = useGameStore((s) => s.setGame);
  const addToast = useGameStore((s) => s.addToast);
  const [playerName, setPlayerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [saves, setSaves] = useState<GameListItem[]>([]);
  const [loadingSaves, setLoadingSaves] = useState(false);
  const [loadingGameId, setLoadingGameId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSaves = useCallback(async () => {
    setLoadingSaves(true);
    try {
      const data = await api.listGames();
      setSaves(data);
    } catch {
      // No saved games or API not available
      setSaves([]);
    } finally {
      setLoadingSaves(false);
    }
  }, []);

  useEffect(() => {
    if (showLoad) fetchSaves();
  }, [showLoad, fetchSaves]);

  const handleNewGame = async () => {
    if (!playerName.trim()) return;
    setCreating(true);
    try {
      const gameState = await api.newGame(playerName.trim());
      setGame(gameState);
      navigate(`/game/${gameState.id}`);
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not create a new game. Is the server running?', duration: 5000 });
    } finally {
      setCreating(false);
    }
  };

  const handleLoadGame = async (id: string) => {
    setLoadingGameId(id);
    try {
      const gameState = await api.getGame(id);
      setGame(gameState);
      navigate(`/game/${gameState.id}`);
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not load game.', duration: 4000 });
    } finally {
      setLoadingGameId(null);
    }
  };

  const handleDeleteGame = async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteGame(id);
      setSaves((prev) => prev.filter((s) => s.id !== id));
      addToast({ type: 'info', title: 'Game Deleted', message: 'Save file removed.', duration: 3000 });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not delete game.', duration: 4000 });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-center mb-8"
      >
        <h1 className="text-5xl sm:text-6xl font-bold text-amber-800 mb-2 tracking-tight">
          Lemonade Stand
        </h1>
        <h2 className="text-2xl sm:text-3xl font-bold text-amber-500">
          Tycoon
        </h2>
        <p className="text-ink-light mt-3 max-w-md mx-auto text-sm">
          Start with a $50 lemonade stand and build a global beverage empire!
        </p>
      </motion.div>

      {/* Lemonade Stand Graphic */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="mb-8"
      >
        <LemonadeStandGraphic size="lg" animated={true} />
      </motion.div>

      {/* New Game form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="game-card w-full max-w-sm mb-4"
      >
        <h3 className="font-bold text-ink mb-3 text-center">New Game</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter your name..."
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNewGame()}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300"
            maxLength={30}
            autoFocus
          />
          <button
            onClick={handleNewGame}
            disabled={creating || !playerName.trim()}
            className="btn-primary"
          >
            {creating ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
            Play
          </button>
        </div>
      </motion.div>

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex gap-3"
      >
        <button onClick={() => setShowLoad(true)} className="btn-secondary">
          <FolderOpen size={16} />
          Load Game
        </button>
        <button onClick={() => setShowAbout(true)} className="btn-secondary">
          <Info size={16} />
          About
        </button>
      </motion.div>

      {/* Load Game Modal */}
      <AnimatePresence>
        {showLoad && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowLoad(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[70vh] overflow-hidden flex flex-col"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-ink text-lg">Load Game</h3>
                <button onClick={() => setShowLoad(false)} className="text-ink-lighter hover:text-ink">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {loadingSaves ? (
                  <div className="flex items-center justify-center py-8 text-ink-light">
                    <Loader2 className="animate-spin mr-2" size={16} />
                    Loading saves...
                  </div>
                ) : saves.length === 0 ? (
                  <div className="text-center py-8 text-ink-light text-sm">
                    No saved games found. Start a new game!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {saves.map((save) => (
                      <div
                        key={save.id}
                        className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 hover:bg-amber-50 transition-colors group"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center text-lg font-bold text-amber-700">
                          {save.playerName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-ink">{save.playerName}</div>
                          <div className="text-xs text-ink-light">
                            Day {save.day} | {formatCurrency(save.cash)} | {StageNames[save.stage] ?? `Stage ${save.stage}`}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => handleLoadGame(save.id)}
                            disabled={loadingGameId === save.id}
                            className="btn-primary text-xs py-1.5 px-3"
                          >
                            {loadingGameId === save.id ? <Loader2 className="animate-spin" size={12} /> : <Play size={12} />}
                            Load
                          </button>
                          <button
                            onClick={() => handleDeleteGame(save.id)}
                            disabled={deletingId === save.id}
                            className="btn-danger text-xs py-1.5 px-2"
                          >
                            {deletingId === save.id ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* About Modal */}
      <AnimatePresence>
        {showAbout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAbout(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-ink text-lg">About</h3>
                <button onClick={() => setShowAbout(false)} className="text-ink-lighter hover:text-ink">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-3 text-sm text-ink-light">
                <p>
                  <strong className="text-ink">Lemonade Stand Tycoon</strong> is a business simulation
                  game where you start with a humble lemonade stand and build your way to a global
                  beverage empire.
                </p>
                <p>
                  Manage your recipe, set competitive prices, buy supplies, hire employees, and expand
                  to new locations. Weather, events, and customer satisfaction all play a role in
                  your success.
                </p>
                <p>
                  <strong className="text-ink">How to play:</strong>
                </p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Buy supplies (cups, lemons, sugar, ice, water)</li>
                  <li>Adjust your recipe for the best taste</li>
                  <li>Set your price per cup</li>
                  <li>Click "Start Day" to advance and see results</li>
                  <li>Repeat to grow your empire!</li>
                </ol>
                <p className="text-xs text-ink-lighter pt-2 border-t border-gray-100">
                  Progress through 10 stages from Neighborhood Stand to Global Domination.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
