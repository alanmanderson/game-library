/**
 * League tier mapping for ranked play.
 *
 * Mirrors `backend/app/tiers.py`. Tier is derived from the player's ELO
 * rating using exclusive upper-bound thresholds.
 */

export type Tier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond";

export const TIER_ORDER: readonly Tier[] = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
];

/** Return the tier for a given ELO rating. */
export function tierForRating(rating: number): Tier {
  if (rating < 1400) return "Bronze";
  if (rating < 1600) return "Silver";
  if (rating < 1800) return "Gold";
  if (rating < 2000) return "Platinum";
  return "Diamond";
}

/** Colour used for the tier badge; uses CSS variables with a few tier-specific hues. */
export const TIER_COLORS: Record<Tier, string> = {
  Bronze: "#a97449",
  Silver: "#b9b9c4",
  Gold: "#d4a843",
  Platinum: "#8ce3d5",
  Diamond: "#7ec4ff",
};
