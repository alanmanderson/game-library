import { Store, MapPin, Users } from 'lucide-react';
import type { Stand } from '@/types/game';
import { formatCurrency } from '@/utils/format';
import { LocationTypeNames } from '@/types/game';

interface StandCardProps {
  stand: Stand;
  isSelected: boolean;
  onClick: () => void;
}

export default function StandCard({ stand, isSelected, onClick }: StandCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left game-card transition-all cursor-pointer ${
        isSelected
          ? 'ring-2 ring-amber-400 border-amber-300 bg-amber-50/50'
          : 'hover:border-amber-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          stand.isOpen
            ? 'bg-gradient-to-br from-green-100 to-green-200'
            : 'bg-gradient-to-br from-gray-100 to-gray-200'
        }`}>
          <Store size={18} className={stand.isOpen ? 'text-green-700' : 'text-gray-500'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-ink truncate">{stand.name}</div>
          <div className="flex items-center gap-1 text-xs text-ink-light">
            <MapPin size={10} />
            <span className="truncate">{stand.locationName}</span>
            <span className="text-ink-lighter">({LocationTypeNames[stand.locationType] ?? ''})</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-green-700 text-sm">{formatCurrency(stand.pricePerCup)}</div>
          <div className="flex items-center gap-1 text-xs text-ink-light">
            <Users size={10} />
            <span>{stand.footTraffic}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
