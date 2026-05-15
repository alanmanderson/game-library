// ============================================================
// Game Actions Hook
// High-level actions: advance day, update recipe, set price, etc.
// Coordinates API calls with store updates and toast feedback.
// ============================================================

import { useCallback } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { api } from '@/services';

export function useGameActions() {
  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);
  const setLastDayResult = useGameStore((s) => s.setLastDayResult);
  const setIsAdvancing = useGameStore((s) => s.setIsAdvancing);
  const setShowDayResult = useGameStore((s) => s.setShowDayResult);
  const addToast = useGameStore((s) => s.addToast);

  const advanceDay = useCallback(async () => {
    if (!game) return;
    setIsAdvancing(true);
    try {
      const result = await api.advanceDay(game.id);
      setLastDayResult(result);
      // Reload full game state to stay in sync
      const updated = await api.getGame(game.id);
      setGame(updated);
      setShowDayResult(true);

      const profit = result.revenue - result.expenses;
      addToast({
        type: profit >= 0 ? 'success' : 'warning',
        title: `Day ${result.day} Complete`,
        message: profit >= 0
          ? `You earned $${profit.toFixed(2)} profit!`
          : `You lost $${Math.abs(profit).toFixed(2)} today.`,
        duration: 4000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addToast({ type: 'error', title: 'Failed to advance day', message, duration: 5000 });
    } finally {
      setIsAdvancing(false);
    }
  }, [game, setGame, setLastDayResult, setIsAdvancing, setShowDayResult, addToast]);

  const setPrice = useCallback(async (standId: string, price: number) => {
    if (!game) return;
    try {
      const updated = await api.setPrice(game.id, { standId, price });
      setGame(updated);
      addToast({ type: 'success', title: 'Price Updated', message: `Set to $${price.toFixed(2)}`, duration: 2000 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addToast({ type: 'error', title: 'Failed to set price', message, duration: 4000 });
    }
  }, [game, setGame, addToast]);

  const setRecipe = useCallback(async (
    standId: string,
    recipe: { waterRatio: number; lemonRatio: number; sugarRatio: number; iceRatio: number },
  ) => {
    if (!game) return;
    try {
      const updated = await api.setRecipe(game.id, { standId, ...recipe });
      setGame(updated);
      addToast({ type: 'success', title: 'Recipe Updated', message: 'Your new recipe is live!', duration: 2000 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addToast({ type: 'error', title: 'Failed to update recipe', message, duration: 4000 });
    }
  }, [game, setGame, addToast]);

  const buySupplies = useCallback(async (
    supplies: { cups: number; lemons: number; sugar: number; ice: number; water: number },
  ) => {
    if (!game) return;
    try {
      const updated = await api.buySupplies(game.id, supplies);
      setGame(updated);
      addToast({ type: 'success', title: 'Supplies Purchased', message: 'Inventory restocked!', duration: 2000 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addToast({ type: 'error', title: 'Failed to buy supplies', message, duration: 4000 });
    }
  }, [game, setGame, addToast]);

  const hireEmployee = useCallback(async (name: string, role: string) => {
    if (!game) return;
    try {
      const updated = await api.hireEmployee(game.id, { name, role });
      setGame(updated);
      addToast({ type: 'success', title: 'Employee Hired', message: `${name} joined as ${role}!`, duration: 3000 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addToast({ type: 'error', title: 'Failed to hire', message, duration: 4000 });
    }
  }, [game, setGame, addToast]);

  const openNewStand = useCallback(async (locationName: string, locationType: string) => {
    if (!game) return;
    try {
      const updated = await api.openStand(game.id, { locationName, locationType });
      setGame(updated);
      addToast({ type: 'success', title: 'New Stand Opened!', message: `Now operating at ${locationName}`, duration: 3000 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addToast({ type: 'error', title: 'Failed to open stand', message, duration: 4000 });
    }
  }, [game, setGame, addToast]);

  const deleteGame = useCallback(async (id: string) => {
    try {
      await api.deleteGame(id);
      addToast({ type: 'info', title: 'Game Deleted', message: 'Save file removed.', duration: 2000 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addToast({ type: 'error', title: 'Failed to delete game', message, duration: 4000 });
    }
  }, [addToast]);

  return {
    advanceDay,
    setPrice,
    setRecipe,
    buySupplies,
    hireEmployee,
    openNewStand,
    deleteGame,
  };
}
