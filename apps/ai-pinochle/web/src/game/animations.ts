/**
 * Card animation helpers (Web Animations API).
 *
 * Three motion primitives used across HandDisplay and TrickPhase:
 *   - dealFromDeck:     card flies in from the deck marker (center top) into
 *                       its resting position in the player's hand arc.
 *   - flyFromSeatToSlot: card animates from a seat's fan area into the
 *                       trick-center slot it now occupies.
 *   - sweepToWinner:    at end of trick, the four trick cards slide off the
 *                       table toward the winning team's side.
 *
 * All helpers accept a `reduced` flag — when true, they set duration to 0 so
 * the animation finishes on the next frame without any visible motion.
 *
 * Origin markers in the DOM are located via `data-seat-origin` (values:
 * "top", "left", "right", "bottom") and `data-deck-origin` (the deck
 * position). Callers do not need to wire refs — we query at animation time.
 */

const DEAL_DURATION_MS = 420;
const DEAL_STAGGER_MS = 40;
const PLAY_FLIGHT_DURATION_MS = 250;
const TRICK_SWEEP_DURATION_MS = 350;

function centerOf(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function originPoint(selector: string): { x: number; y: number } | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  return centerOf(el);
}

/**
 * Animate `card` flying in from the deck marker. Call once per newly-dealt
 * card, passing an index for stagger.
 */
export function dealFromDeck(
  card: HTMLElement,
  index: number,
  reduced: boolean,
): Animation | null {
  if (reduced) return null;
  const deck = originPoint("[data-deck-origin]");
  if (!deck) return null;
  const target = centerOf(card);
  const dx = deck.x - target.x;
  const dy = deck.y - target.y;
  return card.animate(
    [
      {
        transform: `translate(${dx}px, ${dy}px) rotate(-8deg) scale(0.9)`,
        opacity: 0,
      },
      { transform: "translate(0, 0) rotate(0) scale(1)", opacity: 1 },
    ],
    {
      duration: DEAL_DURATION_MS,
      delay: index * DEAL_STAGGER_MS,
      easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      fill: "both",
    },
  );
}

/**
 * Animate a trick-slot card as though it flew from its owner's seat area.
 * `seatPosition` is the position relative to the viewer ("top" | "left" |
 * "right" | "bottom"). For the local (bottom) seat we read the actual hand
 * bounds so the card lifts out of the player's hand.
 */
export function flyFromSeatToSlot(
  slotCard: HTMLElement,
  seatPosition: "top" | "left" | "right" | "bottom",
  reduced: boolean,
): Animation | null {
  if (reduced) return null;
  const origin = originPoint(`[data-seat-origin="${seatPosition}"]`);
  if (!origin) return null;
  const target = centerOf(slotCard);
  const dx = origin.x - target.x;
  const dy = origin.y - target.y;
  return slotCard.animate(
    [
      {
        transform: `translate(${dx}px, ${dy}px) scale(0.92)`,
        opacity: 0.2,
      },
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
    ],
    {
      duration: PLAY_FLIGHT_DURATION_MS,
      easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      fill: "both",
    },
  );
}

/**
 * Sweep a played trick card off toward the winning team's side. The winning
 * direction is expressed relative to the viewer (bottom = us/partner side,
 * top = partner, etc.).
 */
export function sweepToWinner(
  card: HTMLElement,
  winnerPosition: "top" | "left" | "right" | "bottom",
  reduced: boolean,
): Animation | null {
  if (reduced) return null;
  const distance = 220;
  const [dx, dy] =
    winnerPosition === "top"
      ? [0, -distance]
      : winnerPosition === "bottom"
        ? [0, distance]
        : winnerPosition === "left"
          ? [-distance, 0]
          : [distance, 0];
  return card.animate(
    [
      { transform: "translate(0, 0)", opacity: 1 },
      {
        transform: `translate(${dx}px, ${dy}px) scale(0.8)`,
        opacity: 0,
      },
    ],
    {
      duration: TRICK_SWEEP_DURATION_MS,
      easing: "cubic-bezier(0.45, 0, 0.55, 1)",
      fill: "forwards",
    },
  );
}
