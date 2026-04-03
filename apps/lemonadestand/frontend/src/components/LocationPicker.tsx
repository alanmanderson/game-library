import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Plus, Loader2, DollarSign, Users as UsersIcon, Shield } from 'lucide-react';
import type { LocationOption } from '@/types/game';
import { useGameStore } from '@/stores/gameStore';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/format';

interface LocationPickerProps {
  gameId: string;
}

export default function LocationPicker({ gameId }: LocationPickerProps) {
  const setGame = useGameStore((s) => s.setGame);
  const addToast = useGameStore((s) => s.addToast);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getLocations(gameId);
      setLocations(data);
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not load locations.', duration: 4000 });
    } finally {
      setLoading(false);
    }
  }, [gameId, addToast]);

  useEffect(() => {
    if (showPicker && locations.length === 0) {
      fetchLocations();
    }
  }, [showPicker, locations.length, fetchLocations]);

  const handleOpenStand = async (loc: LocationOption) => {
    setOpening(loc.name);
    try {
      const newState = await api.openStand(gameId, {
        locationName: loc.name,
        locationType: loc.type,
      });
      setGame(newState);
      addToast({ type: 'success', title: 'New Stand Opened!', message: `Opened at ${loc.name}!`, duration: 3000 });
      setShowPicker(false);
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not open stand.', duration: 4000 });
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="game-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin size={20} className="text-amber-600" />
          <h3 className="font-bold text-ink">Expand</h3>
        </div>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="btn-secondary text-sm py-1.5 px-3"
        >
          <Plus size={14} />
          New Stand
        </button>
      </div>

      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {loading ? (
              <div className="flex items-center justify-center py-8 text-ink-light">
                <Loader2 className="animate-spin mr-2" size={16} />
                Loading locations...
              </div>
            ) : locations.length === 0 ? (
              <div className="text-center py-6 text-ink-light text-sm">
                No locations available yet. Progress further to unlock new areas!
              </div>
            ) : (
              <div className="space-y-2">
                {locations.map((loc) => (
                  <div
                    key={loc.name}
                    className="bg-gray-50 rounded-xl p-3 border border-gray-100 hover:border-amber-200 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-bold text-sm text-ink">{loc.name}</div>
                        <div className="text-xs text-ink-light mt-0.5">{loc.description}</div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-ink-light">
                          <span className="flex items-center gap-1">
                            <UsersIcon size={10} />
                            Traffic: {loc.footTraffic}
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign size={10} />
                            Rent: {formatCurrency(loc.dailyRent)}/day
                          </span>
                          {loc.requiresPermit && (
                            <span className="flex items-center gap-1 text-amber-600">
                              <Shield size={10} />
                              Permit Required
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenStand(loc)}
                        disabled={opening === loc.name}
                        className="btn-primary text-xs py-1.5 px-3 shrink-0"
                      >
                        {opening === loc.name ? <Loader2 className="animate-spin" size={12} /> : <Plus size={12} />}
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
