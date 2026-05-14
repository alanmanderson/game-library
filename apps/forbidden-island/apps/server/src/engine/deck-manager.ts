import type {
  TreasureCard, FloodCard, DeckState, TreasureCardType, TileName,
} from '@forbidden-island/shared';
import {
  TILES, TREASURE_CARDS_PER_TYPE, HELICOPTER_LIFT_COUNT,
  WATERS_RISE_COUNT, SANDBAGS_COUNT,
} from '@forbidden-island/shared';
import { shuffle } from '../utils/shuffle.js';
import { generateCardId } from '../utils/id.js';

// ─── Deck creation ──────────────────────────────────────────────────────

export function createTreasureDeck(): DeckState<TreasureCard> {
  const cards: TreasureCard[] = [];

  const treasureTypes: TreasureCardType[] = [
    'earth_stone', 'statue_of_wind', 'crystal_of_fire', 'oceans_chalice',
  ];

  for (const type of treasureTypes) {
    for (let i = 0; i < TREASURE_CARDS_PER_TYPE; i++) {
      cards.push({ id: generateCardId('tc'), type });
    }
  }

  for (let i = 0; i < HELICOPTER_LIFT_COUNT; i++) {
    cards.push({ id: generateCardId('hl'), type: 'helicopter_lift' });
  }

  for (let i = 0; i < WATERS_RISE_COUNT; i++) {
    cards.push({ id: generateCardId('wr'), type: 'waters_rise' });
  }

  for (let i = 0; i < SANDBAGS_COUNT; i++) {
    cards.push({ id: generateCardId('sb'), type: 'sandbags' });
  }

  return {
    drawPile: shuffle(cards),
    discardPile: [],
  };
}

export function createFloodDeck(): DeckState<FloodCard> {
  const cards: FloodCard[] = TILES.map((t) => ({
    id: generateCardId('fc'),
    tileName: t.name,
  }));

  return {
    drawPile: shuffle(cards),
    discardPile: [],
  };
}

// ─── Deck operations (pure, return new deck state) ──────────────────────

/**
 * Draw a card from the draw pile. If empty, reshuffle discard into draw.
 * Returns [newDeck, drawnCard]. Card is null if deck is completely exhausted
 * (should never happen for flood deck; treasure deck reshuffles).
 */
export function drawCard<T>(deck: DeckState<T>): [DeckState<T>, T | null] {
  if (deck.drawPile.length === 0) {
    if (deck.discardPile.length === 0) {
      return [deck, null];
    }
    // Reshuffle discard into draw pile
    const reshuffled: DeckState<T> = {
      drawPile: shuffle(deck.discardPile),
      discardPile: [],
    };
    return drawCard(reshuffled);
  }

  const [card, ...rest] = deck.drawPile;
  return [
    { drawPile: rest, discardPile: deck.discardPile },
    card,
  ];
}

/**
 * Place a card onto the discard pile.
 */
export function discardCard<T>(deck: DeckState<T>, card: T): DeckState<T> {
  return {
    drawPile: deck.drawPile,
    discardPile: [...deck.discardPile, card],
  };
}

/**
 * Waters Rise! mechanic: shuffle the flood discard pile and place it
 * ON TOP of the flood draw pile. This is critical -- recently flooded
 * tiles will be drawn again soon.
 */
export function watersRiseReshuffle(deck: DeckState<FloodCard>): DeckState<FloodCard> {
  const shuffledDiscard = shuffle(deck.discardPile);
  return {
    drawPile: [...shuffledDiscard, ...deck.drawPile],
    discardPile: [],
  };
}

/**
 * Remove a card from the flood deck entirely (when a tile sinks,
 * its flood card is removed from the game permanently).
 */
export function removeFloodCard(
  deck: DeckState<FloodCard>,
  tileName: TileName,
): DeckState<FloodCard> {
  return {
    drawPile: deck.drawPile.filter((c) => c.tileName !== tileName),
    discardPile: deck.discardPile.filter((c) => c.tileName !== tileName),
  };
}
