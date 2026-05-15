import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Package, ShoppingCart, Loader2 } from 'lucide-react';
import type { Inventory, SupplyPrices, Recipe } from '@/types/game';
import { useGameStore } from '@/stores/gameStore';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/format';

interface InventoryPanelProps {
  inventory: Inventory;
  gameId: string;
  cash: number;
  recipe?: Recipe | null;
}

function DrinksCapacity({ inventory, recipe }: { inventory: Inventory; recipe: Recipe }) {
  const items = [
    { label: 'Cups', emoji: '\uD83E\uDD64', drinks: inventory.cups },
    { label: 'Lemons', emoji: '\uD83C\uDF4B', drinks: recipe.lemonRatio > 0 ? Math.floor(inventory.lemons / recipe.lemonRatio) : Infinity },
    { label: 'Sugar', emoji: '\uD83C\uDF6C', drinks: recipe.sugarRatio > 0 ? Math.floor(inventory.sugar / recipe.sugarRatio) : Infinity },
    { label: 'Ice', emoji: '\uD83E\uDDCA', drinks: recipe.iceRatio > 0 ? Math.floor(inventory.ice / recipe.iceRatio) : Infinity },
    { label: 'Water', emoji: '\uD83D\uDCA7', drinks: recipe.waterRatio > 0 ? Math.floor(inventory.water / recipe.waterRatio) : Infinity },
  ];

  const bottleneck = Math.min(...items.map((i) => i.drinks));

  return (
    <div className="bg-amber-50 rounded-xl p-3 mb-3 border border-amber-100">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-ink-light uppercase tracking-wide">Drinks Possible</span>
        <span className="text-sm font-bold text-ink">{bottleneck === Infinity ? '--' : bottleneck}</span>
      </div>
      <div className="space-y-1">
        {items.map((item) => {
          const isBottleneck = item.drinks === bottleneck && item.drinks !== Infinity;
          const displayDrinks = item.drinks === Infinity ? '\u221E' : item.drinks;
          const barWidth = bottleneck > 0 && item.drinks !== Infinity
            ? Math.min(100, (item.drinks / Math.max(...items.filter(i => i.drinks !== Infinity).map(i => i.drinks))) * 100)
            : item.drinks === Infinity ? 100 : 0;

          return (
            <div key={item.label} className="flex items-center gap-2">
              <span className="text-sm w-5 text-center">{item.emoji}</span>
              <div className="flex-1 h-4 bg-white rounded-full overflow-hidden relative">
                <motion.div
                  initial={false}
                  animate={{ width: `${barWidth}%` }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  className={`h-full rounded-full ${isBottleneck ? 'bg-red-300' : 'bg-amber-300'}`}
                />
              </div>
              <span className={`text-xs font-bold w-10 text-right ${isBottleneck ? 'text-red-500' : 'text-ink-light'}`}>
                {displayDrinks}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function InventoryPanel({ inventory, gameId, cash, recipe }: InventoryPanelProps) {
  const setGame = useGameStore((s) => s.setGame);
  const addToast = useGameStore((s) => s.addToast);
  const [prices, setPrices] = useState<SupplyPrices | null>(null);
  const [buying, setBuying] = useState(false);
  const [quantities, setQuantities] = useState({ cups: 0, lemons: 0, sugar: 0, ice: 0, water: 0 });

  const fetchPrices = useCallback(async () => {
    try {
      const data = await api.getPrices(gameId);
      setPrices(data);
    } catch {
      // Prices not available yet
    }
  }, [gameId]);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  const totalCost = prices
    ? quantities.cups * prices.cupsPerPack +
      quantities.lemons * prices.lemonsPerPound +
      quantities.sugar * prices.sugarPerPound +
      quantities.ice * prices.icePerPound +
      quantities.water * prices.waterPerGallon
    : 0;

  const handleBuy = async () => {
    if (!prices || totalCost <= 0 || totalCost > cash) return;
    setBuying(true);
    try {
      const newState = await api.buySupplies(gameId, quantities);
      setGame(newState);
      setQuantities({ cups: 0, lemons: 0, sugar: 0, ice: 0, water: 0 });
      addToast({ type: 'success', title: 'Supplies Purchased!', message: `Spent ${formatCurrency(totalCost)}`, duration: 3000 });
    } catch {
      addToast({ type: 'error', title: 'Purchase Failed', message: 'Could not buy supplies.', duration: 4000 });
    } finally {
      setBuying(false);
    }
  };

  const supplies = [
    { key: 'cups' as const, label: 'Cups', icon: '\uD83E\uDD64', count: inventory.cups, unit: 'packs', price: prices?.cupsPerPack },
    { key: 'lemons' as const, label: 'Lemons', icon: '\uD83C\uDF4B', count: inventory.lemons, unit: 'lbs', price: prices?.lemonsPerPound },
    { key: 'sugar' as const, label: 'Sugar', icon: '\uD83C\uDF6C', count: inventory.sugar, unit: 'lbs', price: prices?.sugarPerPound },
    { key: 'ice' as const, label: 'Ice', icon: '\uD83E\uDDCA', count: inventory.ice, unit: 'lbs', price: prices?.icePerPound },
    { key: 'water' as const, label: 'Water', icon: '\uD83D\uDCA7', count: inventory.water, unit: 'gal', price: prices?.waterPerGallon },
  ];

  return (
    <div className="game-card">
      <div className="flex items-center gap-2 mb-4">
        <Package size={20} className="text-amber-600" />
        <h3 className="font-bold text-ink">Inventory</h3>
      </div>

      {/* Current inventory */}
      <div className="grid grid-cols-5 gap-2 mb-3">
        {supplies.map((s) => (
          <motion.div
            key={s.key}
            initial={false}
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 0.3 }}
            className="text-center bg-cream rounded-xl p-2"
          >
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="font-bold text-ink text-sm">{s.count}</div>
            <div className="text-xs text-ink-light">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Drinks possible from inventory */}
      {recipe && <DrinksCapacity inventory={inventory} recipe={recipe} />}

      {/* Buy interface */}
      <div className="border-t border-amber-100 pt-4 mt-3">
        {!prices ? (
          <div className="flex items-center justify-center py-4 text-ink-light">
            <Loader2 className="animate-spin mr-2" size={16} />
            Loading prices...
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {supplies.map((s) => {
                const unitPrice = s.price ?? 0;
                const maxAffordable = unitPrice > 0 ? Math.floor(cash / unitPrice) : 999;
                const sliderMax = Math.max(10, Math.min(maxAffordable, 999));

                return (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="text-lg w-8 text-center">{s.icon}</span>
                    <span className="text-sm font-medium text-ink w-16">{s.label}</span>
                    <span className="text-xs text-ink-light w-20">{formatCurrency(unitPrice)}/{s.unit}</span>
                    <input
                      type="range"
                      min={0}
                      max={sliderMax}
                      value={Math.min(quantities[s.key], sliderMax)}
                      onChange={(e) => setQuantities((q) => ({ ...q, [s.key]: parseInt(e.target.value) }))}
                      className="flex-1 bg-amber-100"
                    />
                    <input
                      type="number"
                      min={0}
                      value={quantities[s.key]}
                      onChange={(e) => {
                        const val = Math.max(0, parseInt(e.target.value) || 0);
                        setQuantities((q) => ({ ...q, [s.key]: val }));
                      }}
                      className="w-16 text-sm font-bold text-ink text-right bg-white border border-amber-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-amber-100">
              <div>
                <span className="text-sm text-ink-light">Total: </span>
                <span className={`font-bold ${totalCost > cash ? 'text-danger' : 'text-ink'}`}>
                  {formatCurrency(totalCost)}
                </span>
                {totalCost > cash && (
                  <span className="text-xs text-danger ml-2">Not enough cash!</span>
                )}
              </div>
              <button
                onClick={handleBuy}
                disabled={buying || totalCost <= 0 || totalCost > cash}
                className="btn-primary text-sm py-2 px-4"
              >
                {buying ? <Loader2 className="animate-spin" size={14} /> : <ShoppingCart size={14} />}
                Buy
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
