import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Sun, ArrowLeft } from 'lucide-react';
import { api } from '@/services/api';
import { useGameStore } from '@/stores/gameStore';
import Header from '@/components/Header';
import StandPanel from '@/components/StandPanel';
import InventoryPanel from '@/components/InventoryPanel';
import FinancialChart from '@/components/FinancialChart';
import AchievementPanel from '@/components/AchievementPanel';
import EventBanner from '@/components/EventBanner';
import EmployeePanel from '@/components/EmployeePanel';
import CityMap from '@/components/CityMap';
import ProgressionBanner from '@/components/ProgressionBanner';
import DayResultModal from '@/components/DayResultModal';

export default function GameDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);
  const addToast = useGameStore((s) => s.addToast);
  const isAdvancing = useGameStore((s) => s.isAdvancing);
  const setIsAdvancing = useGameStore((s) => s.setIsAdvancing);
  const dayResults = useGameStore((s) => s.dayResults);
  const addDayResult = useGameStore((s) => s.addDayResult);
  const clearDayResults = useGameStore((s) => s.clearDayResults);
  const lastDayResult = useGameStore((s) => s.lastDayResult);
  const setLastDayResult = useGameStore((s) => s.setLastDayResult);
  const showDayResult = useGameStore((s) => s.showDayResult);
  const setShowDayResult = useGameStore((s) => s.setShowDayResult);
  const [loading, setLoading] = useState(!game);
  const [selectedStandId, setSelectedStandId] = useState<string | null>(null);

  // Load game if not in store
  const loadGame = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const gameState = await api.getGame(id);
      setGame(gameState);
      clearDayResults();
      if (gameState.isGameOver) {
        navigate(`/game-over/${gameState.id}`);
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not load game.', duration: 5000 });
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id, setGame, clearDayResults, addToast, navigate]);

  useEffect(() => {
    if (!game || game.id !== id) {
      loadGame();
    } else {
      setLoading(false);
    }
  }, [game, id, loadGame]);

  // Auto-select first stand
  useEffect(() => {
    if (game && game.stands.length > 0 && !selectedStandId) {
      setSelectedStandId(game.stands[0].id);
    }
  }, [game, selectedStandId]);

  const handleAdvanceDay = async () => {
    if (!game || isAdvancing) return;
    setIsAdvancing(true);
    try {
      const dayResult = await api.advanceDay(game.id);
      setLastDayResult(dayResult);
      addDayResult(dayResult);

      // Refresh game state
      const newState = await api.getGame(game.id);
      setGame(newState);

      setShowDayResult(true);

      if (newState.isGameOver) {
        setTimeout(() => navigate(`/game-over/${newState.id}`), 2000);
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not advance day. Check your supplies!', duration: 5000 });
    } finally {
      setIsAdvancing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin mx-auto mb-4 text-amber-500" size={48} />
          <p className="text-ink-light">Loading your lemonade empire...</p>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-ink-light mb-4">Game not found.</p>
          <button onClick={() => navigate('/')} className="btn-primary">
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  const selectedStand = game.stands.find((s) => s.id === selectedStandId) ?? null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-lemon-light/30">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Back button + Advance Day */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate('/')} className="btn-secondary text-sm py-2 px-3">
            <ArrowLeft size={14} />
            Menu
          </button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleAdvanceDay}
            disabled={isAdvancing}
            className="advance-day-btn pulse-glow"
          >
            {isAdvancing ? (
              <>
                <Loader2 className="animate-spin" size={22} />
                Simulating...
              </>
            ) : (
              <>
                <Sun size={22} />
                Start Day {game.day}
              </>
            )}
          </motion.button>
        </div>

        {/* Events */}
        {game.activeEvents.length > 0 && (
          <div className="mb-6">
            <EventBanner events={game.activeEvents} />
          </div>
        )}

        {/* Progression */}
        <div className="mb-6">
          <ProgressionBanner
            stage={game.stage}
            cupsSold={game.cupsSold}
            totalRevenue={game.totalRevenue}
          />
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: City Map + Inventory */}
          <div className="lg:col-span-1 space-y-4">
            {/* City Map */}
            <CityMap
              stands={game.stands}
              cityEvents={game.cityEvents ?? []}
              gameId={game.id}
              selectedStandId={selectedStandId}
              onSelectStand={setSelectedStandId}
              cash={game.cash}
            />

            {/* Inventory */}
            <InventoryPanel inventory={game.inventory} gameId={game.id} cash={game.cash} />
          </div>

          {/* Center column: Selected Stand Details */}
          <div className="lg:col-span-1">
            {selectedStand ? (
              <StandPanel stand={selectedStand} gameId={game.id} />
            ) : (
              <div className="game-card text-center py-8 text-ink-light">
                Select a stand on the map to manage it
              </div>
            )}
          </div>

          {/* Right column: Financials, Employees, Achievements */}
          <div className="lg:col-span-1 space-y-4">
            <FinancialChart dayResults={dayResults} />
            <EmployeePanel employees={game.employees} gameId={game.id} />
            <AchievementPanel achievements={game.achievements} />
          </div>
        </div>
      </main>

      {/* Day Result Modal */}
      {lastDayResult && (
        <DayResultModal
          result={lastDayResult}
          isOpen={showDayResult}
          onClose={() => setShowDayResult(false)}
        />
      )}
    </div>
  );
}
