import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Plus, Loader2, DollarSign, Users, Shield,
  Home, Trees, GraduationCap, Building2, Waves, ShoppingBag,
  Trophy, Route, ShoppingCart, Zap, Calendar, X,
} from 'lucide-react';
import type { Stand, LocationOption, CityEvent } from '@/types/game';
import { LocationTypeNames } from '@/types/game';
import { useGameStore } from '@/stores/gameStore';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/format';

// Per-type visual styling for markers
const TYPE_STYLES = {
  Residential: { bg: 'bg-green-500', icon: Home },
  Park: { bg: 'bg-emerald-500', icon: Trees },
  School: { bg: 'bg-amber-500', icon: GraduationCap },
  Downtown: { bg: 'bg-blue-500', icon: Building2 },
  Mall: { bg: 'bg-purple-500', icon: ShoppingBag },
  Beach: { bg: 'bg-cyan-500', icon: Waves },
  SportVenue: { bg: 'bg-red-500', icon: Trophy },
  Highway: { bg: 'bg-slate-500', icon: Route },
  SuburbanStrip: { bg: 'bg-orange-500', icon: ShoppingCart },
} as const;

type ZoneType = keyof typeof TYPE_STYLES;

// Map zone definitions - each has a percentage position on the map
interface MapZone {
  id: string;
  type: ZoneType;
  x: number; // percentage
  y: number; // percentage
  locationName: string;
}

// Map geometry (all in percent):
// - Major streets run at 20%, 40%, 60%, 80% along both axes.
// - Markers sit at block centers (10/30/50/70/90) to avoid overlapping street lines.
const MAP_ZONES: MapZone[] = [
  // Row 1 (y=10, top): neighborhoods + nearby park/strip
  { id: 'res1', type: 'Residential', x: 10, y: 10, locationName: 'Home Street' },
  { id: 'res2', type: 'Residential', x: 30, y: 10, locationName: 'Maple Avenue' },
  { id: 'park1', type: 'Park', x: 70, y: 10, locationName: 'Central Park' },
  { id: 'suburb', type: 'SuburbanStrip', x: 90, y: 10, locationName: 'Suburban Plaza' },
  // Row 2 (y=30): school, park, mall
  { id: 'school', type: 'School', x: 10, y: 30, locationName: 'Oak Elementary' },
  { id: 'park2', type: 'Park', x: 50, y: 30, locationName: 'Riverside Park' },
  { id: 'mall1', type: 'Mall', x: 90, y: 30, locationName: 'Westfield Mall' },
  // Row 3 (y=50): downtown + mall
  { id: 'downtown1', type: 'Downtown', x: 30, y: 50, locationName: 'Main Street' },
  { id: 'downtown2', type: 'Downtown', x: 70, y: 50, locationName: 'City Center' },
  { id: 'mall2', type: 'Mall', x: 90, y: 50, locationName: 'Gateway Mall' },
  // Row 4 (y=70): highway + stadium
  { id: 'highway', type: 'Highway', x: 10, y: 70, locationName: 'Highway Rest Stop' },
  { id: 'stadium', type: 'SportVenue', x: 50, y: 70, locationName: 'City Stadium' },
  // Row 5 (y=90, bottom): beaches
  { id: 'beach1', type: 'Beach', x: 30, y: 90, locationName: 'Sunset Beach' },
  { id: 'beach2', type: 'Beach', x: 70, y: 90, locationName: 'Lakeside Beach' },
];

// Shared street line positions so the SVG grid stays aligned with marker coordinates.
const STREET_PCTS = [20, 40, 60, 80];

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
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
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

  const getStandAtZone = (zone: MapZone): Stand | undefined =>
    stands.find((s) => s.locationName === zone.locationName);

  const getLocationForZone = (zone: MapZone): LocationOption | undefined =>
    locations.find((l) => l.name === zone.locationName);

  const getCityEventForZone = (zone: MapZone): CityEvent | undefined =>
    cityEvents.find((e) => e.isActive && e.affectedLocationType === zone.type);

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

      {/* Map */}
      <div className="game-card p-2">
        <div className="relative w-full" style={{ aspectRatio: '4 / 3' }}>
          {/* Road grid background */}
          <div className="absolute inset-0 rounded-lg overflow-hidden bg-[#f1f5fa]">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full"
            >
              {/* Park splashes behind the park zones (decorative) */}
              <rect x="60" y="0" width="20" height="18" rx="2" fill="#dcfce7" />
              <rect x="42" y="22" width="16" height="16" rx="2" fill="#dcfce7" />
              {/* Beach/water strip along the bottom */}
              <rect x="0" y="85" width="100" height="15" fill="#cffafe" />
              {/* Major streets — horizontal then vertical */}
              {STREET_PCTS.map((p) => (
                <line key={`h${p}`} x1="0" y1={p} x2="100" y2={p} stroke="#d7e0ec" strokeWidth="3" strokeLinecap="round" />
              ))}
              {STREET_PCTS.map((p) => (
                <line key={`v${p}`} x1={p} y1="0" x2={p} y2="100" stroke="#d7e0ec" strokeWidth="3" strokeLinecap="round" />
              ))}
            </svg>
          </div>

          {/* Location markers */}
          {MAP_ZONES.map((zone) => {
            const stand = getStandAtZone(zone);
            const loc = getLocationForZone(zone);
            const cityEvent = getCityEventForZone(zone);
            const isOccupied = !!stand;
            const isAvailable = !!loc;
            const isSelected = stand && stand.id === selectedStandId;
            const isHovered = hoveredZoneId === zone.id;
            const style = TYPE_STYLES[zone.type];
            const Icon = style.icon;
            const isLocked = !isOccupied && !isAvailable;
            const tooltipBelow = zone.y < 40;
            // Anchor tooltip horizontally based on marker x position to avoid edge clipping
            const tooltipPosClass =
              zone.x < 25 ? 'left-0'
                : zone.x > 75 ? 'right-0'
                  : 'left-1/2 -translate-x-1/2';

            return (
              <div
                key={zone.id}
                className={`absolute -translate-x-1/2 -translate-y-1/2 ${isHovered ? 'z-40' : 'z-10'}`}
                style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
                onMouseEnter={() => setHoveredZoneId(zone.id)}
                onMouseLeave={() => setHoveredZoneId(null)}
              >
                <motion.button
                  whileHover={!isLocked ? { scale: 1.15 } : undefined}
                  whileTap={!isLocked ? { scale: 0.95 } : undefined}
                  onClick={() => handleZoneClick(zone)}
                  onFocus={() => setHoveredZoneId(zone.id)}
                  onBlur={() => setHoveredZoneId(null)}
                  disabled={isLocked}
                  aria-label={zone.locationName}
                  className="relative block focus:outline-none"
                >
                  <div
                    className={`
                      w-9 h-9 rounded-full shadow-md ring-2 ring-white flex items-center justify-center transition-shadow
                      ${style.bg}
                      ${isSelected ? 'ring-4 !ring-amber-400 shadow-lg shadow-amber-400/40' : ''}
                      ${isLocked ? 'opacity-40 grayscale' : ''}
                    `}
                  >
                    <Icon size={16} className="text-white" strokeWidth={2.5} />
                  </div>
                  {/* Own-stand indicator dot */}
                  {isOccupied && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center shadow">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                    </div>
                  )}
                  {/* City event badge */}
                  {cityEvent && (
                    <div
                      className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white ${
                        cityEvent.trafficMultiplier > 1 ? 'bg-blue-500' : 'bg-red-500'
                      }`}
                    >
                      <Zap size={8} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                </motion.button>

                {/* Hover tooltip */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: tooltipBelow ? -4 : 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: tooltipBelow ? -4 : 4 }}
                      transition={{ duration: 0.12 }}
                      className={`absolute z-30 w-44 bg-white rounded-lg shadow-xl border border-gray-200 p-2.5 text-left pointer-events-none ${tooltipPosClass} ${
                        tooltipBelow ? 'top-full mt-5' : 'bottom-full mb-5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${style.bg}`}>
                          <Icon size={11} className="text-white" strokeWidth={2.5} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-ink leading-tight">{zone.locationName}</div>
                          <div className="text-[9px] text-ink-light leading-tight">
                            {LocationTypeNames[zone.type] ?? zone.type}
                          </div>
                        </div>
                      </div>
                      {isOccupied && stand ? (
                        <div className="space-y-0.5 text-[10px] mt-1.5 border-t border-gray-100 pt-1.5">
                          <div className="flex justify-between"><span className="text-ink-light">Price:</span><span className="font-semibold">{formatCurrency(stand.pricePerCup)}/cup</span></div>
                          <div className="flex justify-between"><span className="text-ink-light">Traffic:</span><span className="font-semibold">{stand.footTraffic}/day</span></div>
                          <div className="flex justify-between"><span className="text-ink-light">Rent:</span><span className="font-semibold">{formatCurrency(stand.rent)}/day</span></div>
                          <div className="text-[9px] font-semibold text-green-700 mt-1">Your stand</div>
                        </div>
                      ) : loc ? (
                        <div className="space-y-0.5 text-[10px] mt-1.5 border-t border-gray-100 pt-1.5">
                          <div className="text-ink-light italic leading-snug mb-1">{loc.description}</div>
                          <div className="flex justify-between"><span className="text-ink-light">Traffic:</span><span className="font-semibold">{loc.footTraffic}/day</span></div>
                          <div className="flex justify-between"><span className="text-ink-light">Rent:</span><span className="font-semibold">{formatCurrency(loc.dailyRent)}/day</span></div>
                          <div className="flex justify-between"><span className="text-ink-light">Build:</span><span className="font-semibold">{formatCurrency(loc.buildCost)}</span></div>
                          {loc.requiresPermit && (
                            <div className="flex items-center gap-1 text-amber-700 font-semibold mt-1">
                              <Shield size={10} /> Permit required
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[10px] text-ink-light italic mt-1.5 border-t border-gray-100 pt-1.5">
                          Unlock this location in a later stage
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
          <div className="w-3 h-3 rounded-full bg-green-500 ring-1 ring-white" /> Your Stand
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-slate-300 ring-1 ring-white" /> Available
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
