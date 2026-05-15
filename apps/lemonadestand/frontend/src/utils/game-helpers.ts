// ============================================================
// Game Logic Helpers
// ============================================================

import { WeatherNames, WeatherIcons, StageNames, EmployeeRoleNames, LocationTypeNames } from '@/types/game';

/** Get human-readable weather name from string enum value. */
export function getWeatherName(weather: string): string {
  return WeatherNames[weather] ?? weather;
}

/** Get weather emoji from string enum value. */
export function getWeatherIcon(weather: string): string {
  return WeatherIcons[weather] ?? '\u2753';
}

/** Get stage display name from string enum value. */
export function getStageName(stage: string): string {
  return StageNames[stage] ?? stage;
}

/** Get employee role name from string enum value. */
export function getRoleName(role: string): string {
  return EmployeeRoleNames[role] ?? role;
}

/** Get location type name from string enum value. */
export function getLocationName(locationType: string): string {
  return LocationTypeNames[locationType] ?? locationType;
}

/** Stage emoji icons. */
export function getStageEmoji(stage: string): string {
  const emojis: Record<string, string> = {
    NeighborhoodStand: '\uD83C\uDFE0',
    MultipleStands: '\uD83C\uDFEA',
    PermitsAndRegulations: '\uD83D\uDCDC',
    BrickAndMortar: '\uD83C\uDFDB\uFE0F',
    MultiStoreChain: '\uD83C\uDFEC',
    FranchiseModel: '\uD83D\uDC51',
    StateExpansion: '\uD83D\uDDFA\uFE0F',
    NationalChain: '\uD83C\uDDFA\uD83C\uDDF8',
    InternationalEmpire: '\uD83C\uDF0D',
    GlobalDomination: '\uD83C\uDFC6',
  };
  return emojis[stage] ?? '\u2B50';
}

/** Calculate profit margin as percentage. */
export function calcProfitMargin(revenue: number, expenses: number): number {
  if (revenue === 0) return 0;
  return ((revenue - expenses) / revenue) * 100;
}

/** Get a color class for positive/negative values. */
export function getValueColor(value: number): string {
  if (value > 0) return 'text-green-600';
  if (value < 0) return 'text-red-600';
  return 'text-gray-500';
}

/** Calculate recipe quality based on ratio balance (simple heuristic). */
export function calcRecipeQuality(recipe: { waterRatio: number; lemonRatio: number; sugarRatio: number; iceRatio: number }): number {
  const total = recipe.waterRatio + recipe.lemonRatio + recipe.sugarRatio + recipe.iceRatio;
  if (total === 0) return 0;

  const waterPct = (recipe.waterRatio / total) * 100;
  const lemonPct = (recipe.lemonRatio / total) * 100;
  const sugarPct = (recipe.sugarRatio / total) * 100;
  const icePct = (recipe.iceRatio / total) * 100;

  const waterScore = Math.max(0, 25 - Math.abs(waterPct - 40));
  const lemonScore = Math.max(0, 25 - Math.abs(lemonPct - 25));
  const sugarScore = Math.max(0, 25 - Math.abs(sugarPct - 20));
  const iceScore = Math.max(0, 25 - Math.abs(icePct - 15));

  return Math.round(waterScore + lemonScore + sugarScore + iceScore);
}
