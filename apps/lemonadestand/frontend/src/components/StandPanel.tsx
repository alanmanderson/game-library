import { useState } from 'react';
import { motion } from 'framer-motion';
import { Store, DollarSign, Loader2 } from 'lucide-react';
import type { Stand } from '@/types/game';
import { useGameStore } from '@/stores/gameStore';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/format';
import RecipeEditor from './RecipeEditor';
import { LocationTypeNames } from '@/types/game';

interface StandPanelProps {
  stand: Stand;
  gameId: string;
}

export default function StandPanel({ stand, gameId }: StandPanelProps) {
  const setGame = useGameStore((s) => s.setGame);
  const addToast = useGameStore((s) => s.addToast);
  const [price, setPrice] = useState(stand.pricePerCup);
  const [savingPrice, setSavingPrice] = useState(false);

  const priceChanged = price !== stand.pricePerCup;

  const handleSavePrice = async () => {
    setSavingPrice(true);
    try {
      const newState = await api.setPrice(gameId, { standId: stand.id, price });
      setGame(newState);
      addToast({ type: 'success', title: 'Price Updated!', message: `New price: ${formatCurrency(price)}`, duration: 3000 });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not update price.', duration: 4000 });
    } finally {
      setSavingPrice(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Stand info card */}
      <div className="game-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center">
            <Store size={20} className="text-amber-700" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-ink">{stand.name}</h3>
            <p className="text-xs text-ink-light">
              {stand.locationName} ({LocationTypeNames[stand.locationType] ?? 'Unknown'})
            </p>
          </div>
          <div className={`text-xs font-bold px-2 py-1 rounded-full ${stand.isOpen ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {stand.isOpen ? 'Open' : 'Closed'}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-50 rounded-xl p-2">
            <div className="text-xs text-ink-light">Foot Traffic</div>
            <div className="font-bold text-ink">{stand.footTraffic}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-2">
            <div className="text-xs text-ink-light">Daily Rent</div>
            <div className="font-bold text-ink">{formatCurrency(stand.rent)}</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-2">
            <div className="text-xs text-ink-light">Level</div>
            <div className="font-bold text-ink">{stand.level}</div>
          </div>
        </div>

        {/* Price setting */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className="text-green-600" />
            <span className="text-sm font-medium text-ink">Price per Cup</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-light">$0.25</span>
            <input
              type="range"
              min={25}
              max={1000}
              step={25}
              value={Math.round(price * 100)}
              onChange={(e) => setPrice(parseInt(e.target.value) / 100)}
              className="flex-1 bg-green-100"
            />
            <span className="text-sm text-ink-light">$10</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="font-bold text-lg text-green-700">{formatCurrency(price)}</span>
            {priceChanged && (
              <button
                onClick={handleSavePrice}
                disabled={savingPrice}
                className="btn-primary text-xs py-1.5 px-3"
              >
                {savingPrice ? <Loader2 className="animate-spin" size={12} /> : null}
                Set Price
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Recipe editor */}
      <RecipeEditor stand={stand} gameId={gameId} />
    </motion.div>
  );
}
