import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChefHat, Loader2, Save } from 'lucide-react';
import type { Stand } from '@/types/game';
import { useGameStore } from '@/stores/gameStore';
import { api } from '@/services/api';

interface RecipeEditorProps {
  stand: Stand;
  gameId: string;
}

function getQualityLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Perfect!', color: 'text-green-600' };
  if (score >= 70) return { label: 'Great', color: 'text-green-500' };
  if (score >= 50) return { label: 'Good', color: 'text-amber-500' };
  if (score >= 30) return { label: 'Okay', color: 'text-orange-500' };
  return { label: 'Needs Work', color: 'text-red-500' };
}

function calculateQuality(water: number, lemon: number, sugar: number, ice: number): number {
  const total = water + lemon + sugar + ice;
  if (total === 0) return 0;
  const wR = water / total, lR = lemon / total, sR = sugar / total, iR = ice / total;
  const idealW = 0.4, idealL = 0.25, idealS = 0.15, idealI = 0.2;
  const wDiff = Math.abs(wR - idealW), lDiff = Math.abs(lR - idealL);
  const sDiff = Math.abs(sR - idealS), iDiff = Math.abs(iR - idealI);
  const score = Math.max(0, 100 - (wDiff + lDiff + sDiff + iDiff) * 200);
  return Math.round(score);
}

// Convert between slider "parts" (1-10) and backend ratio
// Each "part" = 0.02 ratio, so slider 5 = 0.10 ratio per cup
const RATIO_PER_PART = 0.02;
function ratioToParts(ratio: number): number {
  return Math.round(ratio / RATIO_PER_PART);
}
function partsToRatio(parts: number): number {
  return Math.round(parts * RATIO_PER_PART * 1000) / 1000;
}

export default function RecipeEditor({ stand, gameId }: RecipeEditorProps) {
  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);
  const addToast = useGameStore((s) => s.addToast);

  const recipe = game?.recipes.find((r) => r.id === stand.recipeId);

  // Sliders work in "parts" (integers 1-10), converted to ratios when saving
  const [water, setWater] = useState(ratioToParts(recipe?.waterRatio ?? 0.10));
  const [lemon, setLemon] = useState(ratioToParts(recipe?.lemonRatio ?? 0.10));
  const [sugar, setSugar] = useState(ratioToParts(recipe?.sugarRatio ?? 0.05));
  const [ice, setIce] = useState(ratioToParts(recipe?.iceRatio ?? 0.10));
  const [saving, setSaving] = useState(false);

  const quality = calculateQuality(water, lemon, sugar, ice);
  const qualityInfo = getQualityLabel(quality);

  const hasChanges =
    partsToRatio(water) !== (recipe?.waterRatio ?? 0) ||
    partsToRatio(lemon) !== (recipe?.lemonRatio ?? 0) ||
    partsToRatio(sugar) !== (recipe?.sugarRatio ?? 0) ||
    partsToRatio(ice) !== (recipe?.iceRatio ?? 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const newState = await api.setRecipe(gameId, {
        standId: stand.id,
        waterRatio: partsToRatio(water),
        lemonRatio: partsToRatio(lemon),
        sugarRatio: partsToRatio(sugar),
        iceRatio: partsToRatio(ice),
      });
      setGame(newState);
      addToast({ type: 'success', title: 'Recipe Updated!', message: `Quality: ${quality}%`, duration: 3000 });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Could not save recipe.', duration: 4000 });
    } finally {
      setSaving(false);
    }
  };

  // Total ratio per cup for the cost display
  const totalPerCup = partsToRatio(water) + partsToRatio(lemon) + partsToRatio(sugar) + partsToRatio(ice);

  const sliders = [
    { label: 'Water', value: water, set: setWater, color: 'bg-blue-400', emoji: '\uD83D\uDCA7' },
    { label: 'Lemons', value: lemon, set: setLemon, color: 'bg-yellow-400', emoji: '\uD83C\uDF4B' },
    { label: 'Sugar', value: sugar, set: setSugar, color: 'bg-pink-300', emoji: '\uD83C\uDF6C' },
    { label: 'Ice', value: ice, set: setIce, color: 'bg-cyan-300', emoji: '\uD83E\uDDCA' },
  ];

  return (
    <div className="game-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ChefHat size={20} className="text-amber-600" />
          <h3 className="font-bold text-ink">Recipe</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-bold text-sm ${qualityInfo.color}`}>{qualityInfo.label}</span>
          <span className="text-xs text-ink-light bg-gray-100 rounded-full px-2 py-0.5">{quality}%</span>
        </div>
      </div>

      {/* Quality preview glass */}
      <div className="flex justify-center mb-4">
        <div className="relative w-20 h-28 rounded-b-xl rounded-t-sm border-2 border-gray-200 bg-white overflow-hidden">
          <motion.div
            className="absolute bottom-0 left-0 right-0"
            animate={{ height: `${Math.min(90, (water + lemon + sugar + ice) * 3)}%` }}
            transition={{ type: 'spring', stiffness: 100 }}
          >
            <div
              className="w-full h-full"
              style={{
                background: `linear-gradient(180deg,
                  rgba(254, 243, 199, ${0.3 + water * 0.03}) 0%,
                  rgba(252, 211, 77, ${0.5 + lemon * 0.05}) 40%,
                  rgba(251, 191, 36, ${0.6 + sugar * 0.03}) 100%
                )`,
              }}
            />
          </motion.div>
          {ice > 0 && (
            <>
              <motion.div
                animate={{ y: [0, -2, 0], rotate: [0, 5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute top-[30%] left-[20%] w-3 h-3 bg-white/70 rounded-sm border border-blue-100"
              />
              {ice > 3 && (
                <motion.div
                  animate={{ y: [0, 2, 0], rotate: [0, -3, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, delay: 0.3 }}
                  className="absolute top-[35%] right-[22%] w-2.5 h-2.5 bg-white/60 rounded-sm border border-blue-100"
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Ingredient cost per cup */}
      <div className="text-center text-xs text-ink-light mb-3">
        Uses {totalPerCup.toFixed(2)} lbs per cup (1 cup + ingredients)
      </div>

      {/* Sliders */}
      <div className="space-y-4">
        {sliders.map((s) => (
          <div key={s.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-ink flex items-center gap-1.5">
                <span>{s.emoji}</span>
                {s.label}
              </span>
              <span className="text-sm font-bold text-ink">{s.value}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={s.value}
              onChange={(e) => s.set(parseInt(e.target.value))}
              className={`w-full ${s.color}`}
            />
          </div>
        ))}
      </div>

      {hasChanges && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 pt-3 border-t border-amber-100"
        >
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full text-sm py-2"
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            Save Recipe
          </button>
        </motion.div>
      )}
    </div>
  );
}
