import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Store, Plus, Loader2, DollarSign, Users, Shield,
  Home, Trees, GraduationCap, Building2, Waves, ShoppingBag,
  Trophy, Route, ShoppingCart, Zap, Calendar, X,
} from 'lucide-react';
import type { Stand, LocationOption, CityEvent } from '@/types/game';
import { LocationTypeNames } from '@/types/game';
import { useGameStore } from '@/stores/gameStore';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/format';

// Map zone definitions - each has a grid position, type, and visual
interface MapZone {
  id: string;
  label: string;
  type: string;
  gridRow: number;
  gridCol: number;
  width: number;
  height: number;
  color: string;
  hoverColor: string;
  icon: typeof Home;
  locationNames: string[]; // backend location names that map to this zone
}

const MAP_ZONES: MapZone[] = [
  { id: 'res1', label: 'Home Street', type: 'Residential', gridRow: 0, gridCol: 0, width: 2, height: 1, color: 'bg-green-100', hoverColor: 'hover:bg-green-200', icon: Home, locationNames: ['Home Street'] },
  { id: 'res2', label: 'Maple Avenue', type: 'Residential', gridRow: 0, gridCol: 2, width: 2, height: 1, color: 'bg-green-100', hoverColor: 'hover:bg-green-200', icon: Home, locationNames: ['Maple Avenue'] },
  { id: 'park1', label: 'Central Park', type: 'Park', gridRow: 0, gridCol: 4, width: 2, height: 2, color: 'bg-emerald-100', hoverColor: 'hover:bg-emerald-200', icon: Trees, locationNames: ['Central Park'] },
  { id: 'school', label: 'Oak Elementary', type: 'School', gridRow: 1, gridCol: 0, width: 2, height: 1, color: 'bg-yellow-100', hoverColor: 'hover:bg-yellow-200', icon: GraduationCap, locationNames: ['Oak Elementary'] },
  { id: 'park2', label: 'Riverside Park', type: 'Park', gridRow: 1, gridCol: 2, width: 2, height: 1, color: 'bg-emerald-100', hoverColor: 'hover:bg-emerald-200', icon: Trees, locationNames: ['Riverside Park'] },
  { id: 'suburb', label: 'Suburban Plaza', type: 'SuburbanStrip', gridRow: 2, gridCol: 0, width: 2, height: 1, color: 'bg-orange-100', hoverColor: 'hover:bg-orange-200', icon: ShoppingCart, locationNames: ['Suburban Plaza'] },
  { id: 'downtown1', label: 'Main Street', type: 'Downtown', gridRow: 2, gridCol: 2, width: 2, height: 1, color: 'bg-blue-100', hoverColor: 'hover:bg-blue-200', icon: Building2, locationNames: ['Main Street'] },
  { id: 'downtown2', label: 'City Center', type: 'Downtown', gridRow: 2, gridCol: 4, width: 2, height: 1, color: 'bg-blue-100', hoverColor: 'hover:bg-blue-200', icon: Building2, locationNames: ['City Center'] },
  { id: 'highway', label: 'Highway Rest Stop', type: 'Highway', gridRow: 3, gridCol: 0, width: 2, height: 1, color: 'bg-gray-200', hoverColor: 'hover:bg-gray-300', icon: Route, locationNames: ['Highway Rest Stop'] },
  { id: 'mall1', label: 'Westfield Mall', type: 'Mall', gridRow: 3, gridCol: 2, width: 2, height: 1, color: 'bg-purple-100', hoverColor: 'hover:bg-purple-200', icon: ShoppingBag, locationNames: ['Westfield Mall'] },
  { id: 'mall2', label: 'Gateway Mall', type: 'Mall', gridRow: 3, gridCol: 4, width: 2, height: 1, color: 'bg-purple-100', hoverColor: 'hover:bg-purple-200', icon: ShoppingBag, locationNames: ['Gateway Mall'] },
  { id: 'beach1', label: 'Sunset Beach', type: 'Beach', gridRow: 4, gridCol: 0, width: 3, height: 1, color: 'bg-cyan-100', hoverColor: 'hover:bg-cyan-200', icon: Waves, locationNames: ['Sunset Beach'] },
  { id: 'beach2', label: 'Lakeside Beach', type: 'Beach', gridRow: 4, gridCol: 3, width: 1, height: 1, color: 'bg-cyan-100', hoverColor: 'hover:bg-cyan-200', icon: Waves, locationNames: ['Lakeside Beach'] },
  { id: 'stadium', label: 'City Stadium', type: 'SportVenue', gridRow: 4, gridCol: 4, width: 2, height: 1, color: 'bg-red-100', hoverColor: 'hover:bg-red-200', icon: Trophy, locationNames: ['City Stadium'] },
];

interface CityMapProps {
  stands: Stand[];
  cityEvents: CityEvent[];
  gameId: string;
  selectedStandId: string | null;
  onSelectStand: (id: string) => void;
  cash: number;
}

export default function CityMap({ stands, cityEvents, gameId, selectedStandId, onSelectStand, cash }: CityMapProps) {
  const setGame = useGameStore((s) => s.setGame);
  const addToast = useGameStore((s) => s.addToast);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [selectedZone, setSelectedZone] = useState<MapZone | null>(null);
  const [opening, setOpening] = useState(false);

  const fetchLocations = useCallback(async () => {
    setLoadingLocations(true);
    try {
      const data = await api.getLocations(gameId);
      setLocations(data);
    } catch {
      // silent fail - locations just won't show as available
    } finally {
      setLoadingLocations(false);
    }
  }, [gameId]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations, stands.length]);

  const getStandAtZone = (zone: MapZone): Stand | undefined => {
    return stands.find((s) => zone.locationNames.includes(s.locationName));
  };

  const getLocationForZone = (zone: MapZone): LocationOption | undefined => {
    return locations.find((l) => zone.locationNames.includes(l.name));
  };

  const getCityEventForZone = (zone: MapZone): CityEvent | undefined => {
    return cityEvents.find((e) => e.isActive && e.affectedLocationType === zone.type);
  };

  const handleZoneClick = (zone: MapZone) => {
    const stand = getStandAtZone(zone);
    if (stand) {
      onSelectStand(stand.id);
      setSelectedZone(null);
    } else {
      const loc = getLocationForZone(zone);
      if (loc) {
        setSelectedZone(zone);
      }
    }
  };

  const handleOpenStand = async (loc: LocationOption) => {
    setOpening(true);
    try {
      const newState = await api.openStand(gameId, {
        locationName: loc.name,
        locationType: loc.type,
      });
      setGame(newState);
      addToast({ type: 'success', title: 'New Stand Opened!', message: `Opened at ${loc.name}!`, duration: 3000 });
      setSelectedZone(null);
      fetchLocations();
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not open stand. Check your cash and requirements.', duration: 4000 });
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Map header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={20} className="text-amber-600" />
          <h3 className="font-bold text-ink text-sm">City Map</h3>
          <span className="text-xs text-ink-light font-normal bg-gray-100 rounded-full px-2 py-0.5">
            {stands.length} stand{stands.length !== 1 ? 's' : ''}
          </span>
        </div>
        {loadingLocations && <Loader2 className="animate-spin text-ink-light" size={14} />}
      </div>

      {/* City Events Banner */}
      {cityEvents.length > 0 && (
        <div className="space-y-1">
          {cityEvents.filter((e) => e.isActive).map((evt, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${
                evt.trafficMultiplier > 1
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              <Calendar size={12} />
              <span className="font-medium">{evt.title}</span>
              <span className="text-[10px] opacity-75">
                ({LocationTypeNames[evt.affectedLocationType] ?? evt.affectedLocationType}
                {evt.trafficMultiplier > 1 ? ` +${Math.round((evt.trafficMultiplier - 1) * 100)}%` : ` -${Math.round((1 - evt.trafficMultiplier) * 100)}%`}
                , {evt.duration}d left)
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Map Grid */}
      <div className="game-card p-2">
        <div className="grid grid-cols-6 gap-1" style={{ gridAutoRows: 'minmax(0, 1fr)' }}>
          {MAP_ZONES.map((zone) => {
            const stand = getStandAtZone(zone);
            const loc = getLocationForZone(zone);
            const cityEvent = getCityEventForZone(zone);
            const isOccupied = !!stand;
            const isAvailable = !!loc;
            const isSelected = stand && stand.id === selectedStandId;
            const isZoneSelected = selectedZone?.id === zone.id;
            const ZoneIcon = zone.icon;

            return (
              <motion.button
                key={zone.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleZoneClick(zone)}
                className={`
                  relative rounded-lg p-2 border-2 transition-all text-left cursor-pointer min-h-[70px]
                  ${zone.color} ${zone.hoverColor}
                  ${isSelected ? 'border-amber-400 ring-2 ring-amber-300 shadow-lg' : ''}
                  ${isZoneSelected ? 'border-blue-400 ring-2 ring-blue-300' : ''}
                  ${!isSelected && !isZoneSelected && isOccupied ? 'border-green-300' : ''}
                  ${!isSelected && !isZoneSelected && isAvailable && !isOccupied ? 'border-dashed border-gray-300' : ''}
                  ${!isSelected && !isZoneSelected && !isAvailable && !isOccupied ? 'border-transparent opacity-50' : ''}
                `}
                style={{
                  gridRow: `${zone.gridRow + 1} / span ${zone.height}`,
                  gridColumn: `${zone.gridCol + 1} / span ${zone.width}`,
                }}
              >
                {/* Zone icon and label */}
                <div className="flex items-center gap-1 mb-1">
                  <ZoneIcon size={12} className="text-ink-light shrink-0" />
                  <span className="text-[10px] font-medium text-ink-light truncate">
                    {LocationTypeNames[zone.type] ?? zone.type}
                  </span>
                </div>

                <div className="text-xs font-bold text-ink truncate leading-tight">{zone.label}</div>

                {/* Stand marker */}
                {isOccupied && (
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                      <Store size={8} className="text-white" />
                    </div>
                    <span className="text-[10px] text-green-700 font-medium truncate">
                      {formatCurrency(stand.pricePerCup)}/cup
                    </span>
                  </div>
                )}

                {/* Available marker */}
                {!isOccupied && isAvailable && (
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center shrink-0 border border-dashed border-gray-400">
                      <Plus size={8} className="text-gray-500" />
                    </div>
                    <span className="text-[10px] text-ink-lighter truncate">Available</span>
                  </div>
                )}

                {/* City event badge */}
                {cityEvent && (
                  <div className="absolute top-1 right-1">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                      cityEvent.trafficMultiplier > 1 ? 'bg-blue-500' : 'bg-red-500'
                    }`}>
                      <Zap size={8} className="text-white" />
                    </div>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Open Stand Dialog */}
      <AnimatePresence>
        {selectedZone && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="game-card border-blue-200 bg-blue-50/50"
          >
            {(() => {
              const loc = getLocationForZone(selectedZone);
              if (!loc) return null;
              const canAfford = cash >= loc.buildCost;
              return (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Plus size={16} className="text-blue-600" />
                      <h4 className="font-bold text-sm text-ink">Open New Stand</h4>
                    </div>
                    <button onClick={() => setSelectedZone(null)} className="text-ink-light hover:text-ink">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="text-sm font-medium text-ink mb-1">{loc.name}</div>
                  <div className="text-xs text-ink-light mb-3">{loc.description}</div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-white rounded-lg p-2 text-center">
                      <div className="text-[10px] text-ink-light">Build Cost</div>
                      <div className={`text-sm font-bold ${canAfford ? 'text-green-700' : 'text-red-600'}`}>
                        {formatCurrency(loc.buildCost)}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-2 text-center">
                      <div className="text-[10px] text-ink-light">Daily Rent</div>
                      <div className="text-sm font-bold text-ink">{formatCurrency(loc.dailyRent)}/day</div>
                    </div>
                    <div className="bg-white rounded-lg p-2 text-center">
                      <div className="text-[10px] text-ink-light">Foot Traffic</div>
                      <div className="text-sm font-bold text-ink flex items-center justify-center gap-1">
                        <Users size={12} />
                        {loc.footTraffic}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-2 text-center">
                      <div className="text-[10px] text-ink-light">Permit</div>
                      <div className="text-sm font-bold text-ink flex items-center justify-center gap-1">
                        {loc.requiresPermit ? (
                          <><Shield size={12} className="text-amber-600" /> Required</>
                        ) : (
                          'None'
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenStand(loc)}
                    disabled={opening || !canAfford}
                    className="btn-primary w-full text-sm py-2"
                  >
                    {opening ? (
                      <><Loader2 className="animate-spin" size={14} /> Opening...</>
                    ) : !canAfford ? (
                      <><DollarSign size={14} /> Not enough cash ({formatCurrency(loc.buildCost)} needed)</>
                    ) : (
                      <><Plus size={14} /> Build Stand ({formatCurrency(loc.buildCost)})</>
                    )}
                  </button>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[10px] text-ink-lighter px-1">
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" /> Your Stand
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-gray-300 border border-dashed border-gray-400" /> Available
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-500" /> Event Boost
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" /> Event Penalty
        </span>
      </div>
    </div>
  );
}
