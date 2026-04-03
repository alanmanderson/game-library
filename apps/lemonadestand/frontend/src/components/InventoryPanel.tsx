import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Package, ShoppingCart, Loader2 } from 'lucide-react';
import type { Inventory, SupplyPrices } from '@/types/game';
import { useGameStore } from '@/stores/gameStore';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/format';

interface InventoryPanelProps {
  inventory: Inventory;
  gameId: string;
  cash: number;
}

export default function InventoryPanel({ inventory, gameId, cash }: InventoryPanelProps) {
  const setGame = useGameStore((s) => s.setGame);
  const addToast = useGameStore((s) => s.addToast);
  const [prices, setPrices] = useState<SupplyPrices | null>(null);
  const [buying, setBuying] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
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
    if (showBuy && !prices) {
      fetchPrices();
    }
  }, [showBuy, prices, fetchPrices]);

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
      setShowBuy(false);
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package size={20} className="text-amber-600" />
          <h3 className="font-bold text-ink">Inventory</h3>
        </div>
        <button
          onClick={() => setShowBuy(!showBuy)}
          className="btn-secondary text-sm py-1.5 px-3"
        >
          <ShoppingCart size={14} />
          Buy Supplies
        </button>
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

      {/* Buy interface */}
      {showBuy && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-amber-100 pt-4 mt-3"
        >
          {!prices ? (
            <div className="flex items-center justify-center py-4 text-ink-light">
              <Loader2 className="animate-spin mr-2" size={16} />
              Loading prices...
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {supplies.map((s) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="text-lg w-8 text-center">{s.icon}</span>
                    <span className="text-sm font-medium text-ink w-16">{s.label}</span>
                    <span className="text-xs text-ink-light w-20">{formatCurrency(s.price ?? 0)}/{s.unit}</span>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      value={quantities[s.key]}
                      onChange={(e) => setQuantities((q) => ({ ...q, [s.key]: parseInt(e.target.value) }))}
                      className="flex-1 bg-amber-100"
                    />
                    <span className="text-sm font-bold text-ink w-8 text-right">{quantities[s.key]}</span>
                  </div>
                ))}
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
        </motion.div>
      )}
    </div>
  );
}
