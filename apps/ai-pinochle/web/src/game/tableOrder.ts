const CLOCKWISE = ["north", "east", "south", "west"] as const;

/** Returns [bottom, left, top, right] seat keys rotated so mySeat is at bottom. */
export function getTableOrder(mySeat: string | null): string[] {
  const seat = mySeat?.toLowerCase() ?? null;
  if (!seat) return ["south", "west", "north", "east"];
  const idx = CLOCKWISE.indexOf(seat as (typeof CLOCKWISE)[number]);
  if (idx === -1) return ["south", "west", "north", "east"];
  return [
    CLOCKWISE[idx],               // bottom (me)
    CLOCKWISE[(idx + 1) % 4],     // left (LHO, next clockwise)
    CLOCKWISE[(idx + 2) % 4],     // top (partner)
    CLOCKWISE[(idx + 3) % 4],     // right (RHO)
  ];
}
