import { Trophy, ChevronRight } from 'lucide-react';
import { StageNames } from '@/types/game';

interface ProgressionBannerProps {
  stage: string;
  cupsSold: number;
  totalRevenue: number;
}

const STAGE_ORDER = [
  'NeighborhoodStand', 'MultipleStands', 'PermitsAndRegulations', 'BrickAndMortar',
  'MultiStoreChain', 'FranchiseModel', 'StateExpansion', 'NationalChain',
  'InternationalEmpire', 'GlobalDomination',
];

const STAGE_MILESTONES: Record<string, { cups: number; revenue: number }> = {
  MultipleStands: { cups: 50, revenue: 100 },
  PermitsAndRegulations: { cups: 200, revenue: 300 },
  BrickAndMortar: { cups: 500, revenue: 800 },
  MultiStoreChain: { cups: 1500, revenue: 2000 },
  FranchiseModel: { cups: 5000, revenue: 5000 },
  StateExpansion: { cups: 15000, revenue: 10000 },
  NationalChain: { cups: 50000, revenue: 25000 },
  InternationalEmpire: { cups: 200000, revenue: 50000 },
  GlobalDomination: { cups: 500000, revenue: 100000 },
};

export default function ProgressionBanner({ stage, cupsSold, totalRevenue }: ProgressionBannerProps) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  const nextStage = currentIndex >= 0 && currentIndex < STAGE_ORDER.length - 1 ? STAGE_ORDER[currentIndex + 1] : null;
  const currentName = StageNames[stage] ?? stage;

  if (!nextStage) {
    return (
      <div className="game-card bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
        <div className="flex items-center gap-3">
          <Trophy size={24} className="text-amber-500" />
          <div>
            <div className="font-bold text-amber-800">Global Domination Achieved!</div>
            <div className="text-sm text-amber-600">You have reached the pinnacle of lemonade excellence.</div>
          </div>
        </div>
      </div>
    );
  }

  const milestone = STAGE_MILESTONES[nextStage];
  const nextName = StageNames[nextStage] ?? nextStage;

  if (!milestone) return null;

  const cupsProgress = Math.min(100, (cupsSold / milestone.cups) * 100);
  const revenueProgress = Math.min(100, (totalRevenue / milestone.revenue) * 100);
  const overallProgress = (cupsProgress + revenueProgress) / 2;

  return (
    <div className="game-card bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy size={20} className="text-amber-500" />
          <span className="font-bold text-amber-800 text-sm">{currentName}</span>
          <ChevronRight size={16} className="text-amber-400" />
          <span className="font-bold text-amber-600 text-sm">{nextName}</span>
        </div>
        <span className="text-xs font-semibold text-amber-600 bg-amber-100 rounded-full px-2 py-0.5">
          {overallProgress.toFixed(0)}%
        </span>
      </div>
      <div className="w-full h-3 bg-amber-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-700 ease-out"
          style={{ width: `${overallProgress}%` }}
        />
      </div>
      <div className="flex justify-between mt-2 text-xs text-amber-600">
        <span>Cups: {cupsSold}/{milestone.cups}</span>
        <span>Revenue: ${totalRevenue.toFixed(0)}/${milestone.revenue}</span>
      </div>
    </div>
  );
}
