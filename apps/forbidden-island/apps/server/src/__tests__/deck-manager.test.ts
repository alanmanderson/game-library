import { describe, it, expect } from 'vitest';
import {
  createTreasureDeck, createFloodDeck, drawCard, discardCard,
  watersRiseReshuffle, removeFloodCard,
} from '../engine/deck-manager.js';
import { TOTAL_TREASURE_CARDS, TOTAL_FLOOD_CARDS } from '@forbidden-island/shared';

describe('DeckManager', () => {
  describe('createTreasureDeck', () => {
    it('creates correct number of cards', () => {
      const deck = createTreasureDeck();
      expect(deck.drawPile).toHaveLength(TOTAL_TREASURE_CARDS);
      expect(deck.discardPile).toHaveLength(0);
    });

    it('has 5 of each treasure type', () => {
      const deck = createTreasureDeck();
      for (const type of ['earth_stone', 'statue_of_wind', 'crystal_of_fire', 'oceans_chalice']) {
        const count = deck.drawPile.filter((c) => c.type === type).length;
        expect(count).toBe(5);
      }
    });

    it('has 3 helicopter lift cards', () => {
      const deck = createTreasureDeck();
      expect(deck.drawPile.filter((c) => c.type === 'helicopter_lift')).toHaveLength(3);
    });

    it('has 3 waters rise cards', () => {
      const deck = createTreasureDeck();
      expect(deck.drawPile.filter((c) => c.type === 'waters_rise')).toHaveLength(3);
    });

    it('has 2 sandbags cards', () => {
      const deck = createTreasureDeck();
      expect(deck.drawPile.filter((c) => c.type === 'sandbags')).toHaveLength(2);
    });
  });

  describe('createFloodDeck', () => {
    it('creates 24 flood cards', () => {
      const deck = createFloodDeck();
      expect(deck.drawPile).toHaveLength(TOTAL_FLOOD_CARDS);
      expect(deck.discardPile).toHaveLength(0);
    });

    it('has unique tile names', () => {
      const deck = createFloodDeck();
      const names = new Set(deck.drawPile.map((c) => c.tileName));
      expect(names.size).toBe(24);
    });
  });

  describe('drawCard', () => {
    it('draws from the top of the draw pile', () => {
      const deck = createTreasureDeck();
      const topCard = deck.drawPile[0];
      const [newDeck, card] = drawCard(deck);
      expect(card).toEqual(topCard);
      expect(newDeck.drawPile).toHaveLength(deck.drawPile.length - 1);
    });

    it('reshuffles discard into draw when draw is empty', () => {
      const deck = {
        drawPile: [] as any[],
        discardPile: [{ id: 'a', type: 'earth_stone' as const }, { id: 'b', type: 'earth_stone' as const }],
      };
      const [newDeck, card] = drawCard(deck);
      expect(card).not.toBeNull();
      expect(newDeck.discardPile).toHaveLength(0);
    });

    it('returns null when both piles are empty', () => {
      const deck = { drawPile: [] as any[], discardPile: [] as any[] };
      const [_, card] = drawCard(deck);
      expect(card).toBeNull();
    });
  });

  describe('discardCard', () => {
    it('adds card to discard pile', () => {
      const deck = createTreasureDeck();
      const card = { id: 'test', type: 'earth_stone' as const };
      const newDeck = discardCard(deck, card);
      expect(newDeck.discardPile).toHaveLength(1);
      expect(newDeck.discardPile[0]).toEqual(card);
      expect(newDeck.drawPile).toHaveLength(deck.drawPile.length);
    });
  });

  describe('watersRiseReshuffle', () => {
    it('moves discard pile onto top of draw pile', () => {
      const deck = {
        drawPile: [
          { id: 'draw1', tileName: 'Watchtower' as const },
          { id: 'draw2', tileName: 'Observatory' as const },
        ],
        discardPile: [
          { id: 'disc1', tileName: 'Bronze Gate' as const },
          { id: 'disc2', tileName: 'Iron Gate' as const },
        ],
      };

      const newDeck = watersRiseReshuffle(deck);
      // Discard pile should be empty
      expect(newDeck.discardPile).toHaveLength(0);
      // Draw pile should have all 4 cards
      expect(newDeck.drawPile).toHaveLength(4);
      // The former discard cards should be in the first 2 positions (shuffled)
      const formerDiscardNames = new Set(['Bronze Gate', 'Iron Gate']);
      const topTwoNames = new Set([newDeck.drawPile[0].tileName, newDeck.drawPile[1].tileName]);
      expect(topTwoNames).toEqual(formerDiscardNames);
      // The former draw cards should be in the last 2 positions
      expect(newDeck.drawPile[2].tileName).toBe('Watchtower');
      expect(newDeck.drawPile[3].tileName).toBe('Observatory');
    });
  });

  describe('removeFloodCard', () => {
    it('removes card from both piles', () => {
      const deck = {
        drawPile: [
          { id: '1', tileName: 'Watchtower' as const },
          { id: '2', tileName: 'Bronze Gate' as const },
        ],
        discardPile: [
          { id: '3', tileName: 'Watchtower' as const },
        ],
      };

      const newDeck = removeFloodCard(deck, 'Watchtower');
      expect(newDeck.drawPile).toHaveLength(1);
      expect(newDeck.discardPile).toHaveLength(0);
      expect(newDeck.drawPile[0].tileName).toBe('Bronze Gate');
    });
  });
});
