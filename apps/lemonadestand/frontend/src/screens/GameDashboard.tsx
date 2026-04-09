import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Sun, ArrowLeft, FastForward, AlertTriangle } from 'lucide-react';
import { api } from '@/services/api';
import { useGameStore } from '@/stores/gameStore';
import Header from '@/components/Header';
import RecipeEditor from '@/components/RecipeEditor';
import InventoryPanel from '@/components/InventoryPanel';
import FinancialChart from '@/components/FinancialChart';
import AchievementPanel from '@/components/AchievementPanel';
import EventBanner from '@/components/EventBanner';
import EmployeePanel from '@/components/EmployeePanel';
import CityMap from '@/components/CityMap';
import ProgressionBanner from '@/components/ProgressionBanner';
import DayResultModal from '@/components/DayResultModal';
import SimulationSummaryModal from '@/components/SimulationSummaryModal';
import type { SimulationSummary } from '@/types/game';

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
  const addDayResults = useGameStore((s) => s.addDayResults);
  const setDayResults = useGameStore((s) => s.setDayResults);
  const lastDayResult = useGameStore((s) => s.lastDayResult);
  const setLastDayResult = useGameStore((s) => s.setLastDayResult);
  const showDayResult = useGameStore((s) => s.showDayResult);
  const setShowDayResult = useGameStore((s) => s.setShowDayResult);
  const [loading, setLoading] = useState(!game);
  const [selectedStandId, setSelectedStandId] = useState<string | null>(null);
  const [simulateDays, setSimulateDays] = useState(7);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSummary, setSimulationSummary] = useState<SimulationSummary | null>(null);
  const [showSimulationSummary, setShowSimulationSummary] = useState(false);

  // Load game if not in store
  const loadGame = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const gameState = await api.getGame(id);
      setGame(gameState);
      setDayResults(gameState.dayHistory ?? []);
      if (gameState.isGameOver) {
        navigate(`/game-over/${gameState.id}`);
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not load game.', duration: 5000 });
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id, setGame, setDayResults, addToast, navigate]);

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

  // Determine if current inventory + any open stand's recipe can serve at least one cup
  const canServeOneCup = useMemo(() => {
    if (!game) return true;
    const openStands = game.stands.filter((s) => s.isOpen);
    if (openStands.length === 0) return false;
    if (game.inventory.cups < 1) return false;
    return openStands.some((stand) => {
      const recipe = game.recipes.find((r) => r.id === stand.recipeId);
      if (!recipe) return false;
      return (
        game.inventory.lemons >= recipe.lemonRatio &&
        game.inventory.sugar >= recipe.sugarRatio &&
        game.inventory.ice >= recipe.iceRatio &&
        game.inventory.water >= recipe.waterRatio
      );
    });
  }, [game]);

  const handleSimulateDays = async () => {
    if (!game || isAdvancing || isSimulating) return;
    const days = Math.max(1, Math.min(365, Math.floor(simulateDays)));
    setIsSimulating(true);
    try {
      const summary = await api.simulateDays(game.id, days);
      setSimulationSummary(summary);
      setShowSimulationSummary(true);

      // Add all day results to the running list for the financial chart (single batched update)
      if (summary.dayResults.length > 0) {
        addDayResults(summary.dayResults);
        setLastDayResult(summary.dayResults[summary.dayResults.length - 1]);
      }

      // The server already returned the updated game state in the summary
      setGame(summary.gameState);

      if (summary.stoppedEarly && summary.stopReason && !summary.isGameOver) {
        addToast({
          type: 'warning',
          title: `Simulated ${summary.daysSimulated} of ${summary.daysRequested} days`,
          message: summary.stopReason,
          duration: 5000,
        });
      }

      if (summary.isGameOver) {
        setTimeout(() => navigate(`/game-over/${summary.gameState.id}`), 2500);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not simulate days.';
      addToast({ type: 'error', title: 'Simulation Failed', message: msg, duration: 5000 });
    } finally {
      setIsSimulating(false);
    }
  };

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
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-start sm:justify-between">
          <button onClick={() => navigate('/')} className="btn-secondary text-sm py-2 px-3 self-start">
            <ArrowLeft size={14} />
            Menu
          </button>

          <div className="flex flex-col items-stretch sm:items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <motion.button
                whileHover={!isAdvancing && !isSimulating ? { scale: 1.05 } : undefined}
                whileTap={!isAdvancing && !isSimulating ? { scale: 0.95 } : undefined}
                onClick={handleAdvanceDay}
                disabled={isAdvancing || isSimulating}
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

              <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl p-1.5 shadow-sm">
                <label htmlFor="simulate-days" className="text-xs font-semibold text-ink-light pl-2">
                  Days
                </label>
                <input
                  id="simulate-days"
                  type="number"
                  min={1}
                  max={365}
                  value={simulateDays}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!Number.isNaN(val)) setSimulateDays(Math.max(1, Math.min(365, val)));
                    else setSimulateDays(1);
                  }}
                  disabled={isAdvancing || isSimulating}
                  className="w-14 text-sm font-bold text-ink text-center bg-cream border border-amber-100 rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <motion.button
                  whileHover={!isAdvancing && !isSimulating && canServeOneCup ? { scale: 1.05 } : undefined}
                  whileTap={!isAdvancing && !isSimulating && canServeOneCup ? { scale: 0.95 } : undefined}
                  onClick={handleSimulateDays}
                  disabled={isAdvancing || isSimulating || !canServeOneCup}
                  title={!canServeOneCup ? 'Not enough supplies to serve a single cup' : `Simulate ${simulateDays} day${simulateDays === 1 ? '' : 's'}`}
                  className="btn-primary text-sm py-2 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSimulating ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Simulating...
                    </>
                  ) : (
                    <>
                      <FastForward size={16} />
                      Simulate
                    </>
                  )}
                </motion.button>
              </div>
            </div>

            {!canServeOneCup && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 text-xs text-amber-800 max-w-sm sm:self-end">
                <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
                <span>
                  Not enough supplies to serve a single cup today. Buy more supplies before starting the day.
                </span>
              </div>
            )}
          </div>
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
          {/* Left column: Inventory */}
          <div className="lg:col-span-1 space-y-4">
            <InventoryPanel
              inventory={game.inventory}
              gameId={game.id}
              cash={game.cash}
              recipe={selectedStand ? game.recipes.find((r) => r.id === selectedStand.recipeId) ?? null : null}
            />
          </div>

          {/* Center column: City Map + Recipe editor for the selected stand */}
          <div className="lg:col-span-1 space-y-4">
            <CityMap
              stands={game.stands}
              cityEvents={game.cityEvents ?? []}
              gameId={game.id}
              selectedStandId={selectedStandId}
              onSelectStand={setSelectedStandId}
              cash={game.cash}
            />
            {selectedStand ? (
              <RecipeEditor stand={selectedStand} gameId={game.id} />
            ) : (
              <div className="game-card text-center py-8 text-ink-light">
                Select a stand on the map to edit its recipe
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

      {/* Simulation Summary Modal */}
      {simulationSummary && (
        <SimulationSummaryModal
          summary={simulationSummary}
          isOpen={showSimulationSummary}
          onClose={() => setShowSimulationSummary(false)}
        />
      )}
    </div>
  );
}
