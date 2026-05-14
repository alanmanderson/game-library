import type {
  GameState, GameAction, ServerMessage, ClientGameState,
  ClientPlayerView, TreasureCard,
} from '@forbidden-island/shared';
import {
  MAX_HAND_SIZE, ACTIONS_PER_TURN, TREASURE_CARDS_PER_TURN,
} from '@forbidden-island/shared';
import { validateAction } from './action-validator.js';
import { executeAction } from './action-executor.js';
import { drawFloodCards } from './flood-engine.js';
import { checkWinLoss, isWinningHelicopterLift } from './win-loss-checker.js';
import { drawCard, discardCard, watersRiseReshuffle } from './deck-manager.js';
import { getValidSwimPositions as getValidSwimPositionsImported } from './role-abilities.js';

export interface ProcessResult {
  state: GameState;
  events: ServerMessage[];
}

/**
 * Process a game action through the complete pipeline:
 * validate -> execute -> cascades -> win/loss check.
 */
export function processAction(
  state: GameState,
  playerId: string,
  action: GameAction,
): ProcessResult {
  // 1. Validate
  const validation = validateAction(state, playerId, action);
  if (!validation.valid) {
    return {
      state,
      events: [{ type: 'game:error', message: validation.error ?? 'Invalid action.' }],
    };
  }

  // 2. Check for winning helicopter lift BEFORE executing
  if (action.type === 'play_helicopter_lift') {
    if (isWinningHelicopterLift(state, action.playerIds, action.targetPosition)) {
      const result = executeAction(state, playerId, action);
      const winState: GameState = {
        ...result.state,
        phase: 'won',
        log: [
          ...result.state.log,
          {
            timestamp: Date.now(),
            playerId: null,
            message: 'The adventurers escaped Forbidden Island! Victory!',
            type: 'system' as const,
          },
        ],
      };
      return {
        state: winState,
        events: [...result.events, { type: 'game:won', gameState: toClientState(winState, playerId) }],
      };
    }
  }

  // 3. Execute
  const execResult = executeAction(state, playerId, action);
  let currentState = execResult.state;
  const allEvents: ServerMessage[] = [...execResult.events];

  // 4. Post-execution cascades

  // Check for hand limit overflow after give_card
  if (action.type === 'give_card') {
    const targetPlayer = currentState.players.find((p) => p.id === (action as any).targetPlayerId);
    if (targetPlayer && targetPlayer.hand.length > MAX_HAND_SIZE) {
      currentState = {
        ...currentState,
        phase: 'discard',
        discardingPlayerId: targetPlayer.id,
        previousPhase: currentState.phase,
      };
      allEvents.push({
        type: 'game:player_must_discard',
        playerId: targetPlayer.id,
        handCount: targetPlayer.hand.length,
      });
    }
  }

  // After action phase: check if we should auto-advance
  if (currentState.phase === 'action') {
    // Reset engineer count if action wasn't shore_up
    if (action.type !== 'shore_up') {
      currentState = { ...currentState, engineerShoreUpCount: 0 };
    }

    // If no actions remaining, auto-advance to draw_treasure
    if (currentState.actionsRemaining <= 0) {
      currentState = {
        ...currentState,
        phase: 'draw_treasure',
        treasureCardsDrawn: 0,
        engineerShoreUpCount: 0,
      };
    }
  }

  // 5. Auto-advance draw phases if they're ready
  if (currentState.phase === 'draw_treasure') {
    const treasureResult = autoDrawTreasureCards(currentState);
    currentState = treasureResult.state;
    allEvents.push(...treasureResult.events);
  }

  if (currentState.phase === 'draw_flood') {
    const floodResult = drawFloodCards(currentState);
    currentState = floodResult.state;
    allEvents.push(...floodResult.events);

    // After flood phase completes (if no swim interrupt), advance to next turn
    if (currentState.phase === 'draw_flood') {
      currentState = advanceToNextTurn(currentState);
      const nextPlayer = currentState.players[currentState.currentPlayerIndex];
      allEvents.push({
        type: 'game:turn_changed',
        currentPlayerIndex: currentState.currentPlayerIndex,
        playerId: nextPlayer.id,
      });
    }
  }

  // 6. After swim resolves, check if we need to continue flood drawing
  if (action.type === 'swim' && currentState.phase === 'draw_flood') {
    // Continue flood phase
    const floodResult = drawFloodCards(currentState);
    currentState = floodResult.state;
    allEvents.push(...floodResult.events);

    if (currentState.phase === 'draw_flood') {
      currentState = advanceToNextTurn(currentState);
      const nextPlayer = currentState.players[currentState.currentPlayerIndex];
      allEvents.push({
        type: 'game:turn_changed',
        currentPlayerIndex: currentState.currentPlayerIndex,
        playerId: nextPlayer.id,
      });
    }
  }

  // 7. Win/loss check
  const winLoss = checkWinLoss(currentState);
  if (winLoss.lost) {
    currentState = {
      ...currentState,
      phase: 'lost',
      lossReason: winLoss.lossReason,
      log: [
        ...currentState.log,
        {
          timestamp: Date.now(),
          playerId: null,
          message: `Game lost: ${winLoss.lossReason?.replace(/_/g, ' ')}.`,
          type: 'system' as const,
        },
      ],
    };
    allEvents.push({
      type: 'game:lost',
      gameState: toClientState(currentState, playerId),
      reason: winLoss.lossReason ?? 'unknown',
    });
  }

  return { state: currentState, events: allEvents };
}

/**
 * Draw 2 treasure cards, handling Waters Rise! and hand limit.
 */
function autoDrawTreasureCards(state: GameState): ProcessResult {
  let currentState = state;
  const events: ServerMessage[] = [];
  const currentPlayer = currentState.players[currentState.currentPlayerIndex];

  while (currentState.treasureCardsDrawn < TREASURE_CARDS_PER_TURN) {
    const [newDeck, card] = drawCard(currentState.treasureDeck);
    currentState = { ...currentState, treasureDeck: newDeck };

    if (!card) {
      // Deck exhausted (extremely rare)
      break;
    }

    if (card.type === 'waters_rise') {
      // Waters Rise! -- raise water level, reshuffle flood discard onto draw
      const newWaterLevel = currentState.waterLevel + 1;
      const reshuffledFloodDeck = watersRiseReshuffle(currentState.floodDeck);
      const newTreasureDeck = discardCard(currentState.treasureDeck, card);

      currentState = {
        ...currentState,
        waterLevel: newWaterLevel,
        floodDeck: reshuffledFloodDeck,
        treasureDeck: newTreasureDeck,
        treasureCardsDrawn: currentState.treasureCardsDrawn + 1,
        log: [
          ...currentState.log,
          {
            timestamp: Date.now(),
            playerId: null,
            message: `Waters Rise! Water level is now ${newWaterLevel}.`,
            type: 'special' as const,
          },
        ],
      };

      events.push({
        type: 'game:waters_rise',
        newWaterLevel,
      });

      events.push({
        type: 'game:treasure_draw',
        card: null,
        playerId: currentPlayer.id,
        isWatersRise: true,
      });

      // Check for instant loss
      if (newWaterLevel >= 9) {
        currentState = {
          ...currentState,
          phase: 'lost',
          lossReason: 'water_meter_max',
        };
        return { state: currentState, events };
      }

      continue;
    }

    // Normal treasure card -- add to player's hand
    const newPlayers = currentState.players.map((p) =>
      p.id === currentPlayer.id
        ? { ...p, hand: [...p.hand, card] }
        : p,
    );

    currentState = {
      ...currentState,
      players: newPlayers,
      treasureCardsDrawn: currentState.treasureCardsDrawn + 1,
    };

    events.push({
      type: 'game:treasure_draw',
      card,
      playerId: currentPlayer.id,
      isWatersRise: false,
    });

    // Check hand limit
    const updatedPlayer = currentState.players.find((p) => p.id === currentPlayer.id);
    if (updatedPlayer && updatedPlayer.hand.length > MAX_HAND_SIZE) {
      // Enter discard phase
      currentState = {
        ...currentState,
        phase: 'discard',
        discardingPlayerId: currentPlayer.id,
        previousPhase: 'draw_treasure',
      };

      events.push({
        type: 'game:player_must_discard',
        playerId: currentPlayer.id,
        handCount: updatedPlayer.hand.length,
      });

      return { state: currentState, events };
    }
  }

  // All treasure cards drawn, advance to flood phase
  if (currentState.phase === 'draw_treasure') {
    currentState = {
      ...currentState,
      phase: 'draw_flood',
      floodCardsDrawn: 0,
    };
  }

  return { state: currentState, events };
}

/**
 * Advance to the next player's turn.
 */
function advanceToNextTurn(state: GameState): GameState {
  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;

  return {
    ...state,
    phase: 'action',
    currentPlayerIndex: nextIndex,
    actionsRemaining: ACTIONS_PER_TURN,
    pilotUsedAbility: false,
    engineerShoreUpCount: 0,
    turnNumber: state.turnNumber + 1,
    treasureCardsDrawn: 0,
    floodCardsDrawn: 0,
    navigatorMovesRemaining: 0,
    navigatorTargetPlayerId: null,
  };
}

/**
 * Create a personalized client view of the game state.
 * Hides other players' hands (shows count only) and deck contents.
 */
export function toClientState(state: GameState, playerId: string): ClientGameState {
  const clientPlayers: ClientPlayerView[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    position: p.position,
    hand: p.id === playerId ? p.hand : null,
    handCount: p.hand.length,
    isConnected: p.isConnected,
  }));

  return {
    id: state.id,
    phase: state.phase,
    difficulty: state.difficulty,
    waterLevel: state.waterLevel,
    tiles: state.tiles,
    players: clientPlayers,
    currentPlayerIndex: state.currentPlayerIndex,
    actionsRemaining: state.actionsRemaining,
    treasureDeck: {
      drawPileCount: state.treasureDeck.drawPile.length,
      discardPile: state.treasureDeck.discardPile,
    },
    floodDeck: {
      drawPileCount: state.floodDeck.drawPile.length,
      discardPile: state.floodDeck.discardPile,
    },
    capturedTreasures: state.capturedTreasures,
    pilotUsedAbility: state.pilotUsedAbility,
    engineerShoreUpCount: state.engineerShoreUpCount,
    discardingPlayerId: state.discardingPlayerId,
    swimmingPlayerId: state.swimmingPlayerId,
    previousPhase: state.previousPhase,
    lossReason: state.lossReason,
    turnNumber: state.turnNumber,
    log: state.log,
    myPlayerId: playerId,
    treasureCardsDrawn: state.treasureCardsDrawn,
    floodCardsDrawn: state.floodCardsDrawn,
    navigatorMovesRemaining: state.navigatorMovesRemaining,
    navigatorTargetPlayerId: state.navigatorTargetPlayerId,
  };
}

/**
 * Skip a disconnected player's turn.
 * Draws treasure cards and flood cards automatically.
 */
export function skipDisconnectedTurn(state: GameState): ProcessResult {
  // Go through the phases automatically
  let currentState: GameState = {
    ...state,
    phase: 'draw_treasure',
    treasureCardsDrawn: 0,
    actionsRemaining: 0,
  };
  const events: ServerMessage[] = [];

  // Draw treasure cards
  const treasureResult = autoDrawTreasureCards(currentState);
  currentState = treasureResult.state;
  events.push(...treasureResult.events);

  // If entered discard phase, auto-discard oldest cards
  while (currentState.phase === 'discard' && currentState.discardingPlayerId) {
    const discardingPlayer = currentState.players.find(
      (p) => p.id === currentState.discardingPlayerId,
    );
    if (!discardingPlayer || discardingPlayer.hand.length <= MAX_HAND_SIZE) break;

    const cardToDiscard = discardingPlayer.hand[0];
    const discardResult = processAction(currentState, discardingPlayer.id, {
      type: 'discard',
      cardId: cardToDiscard.id,
    });
    currentState = discardResult.state;
    events.push(...discardResult.events);
  }

  // Draw flood cards
  if (currentState.phase === 'draw_flood') {
    const floodResult = drawFloodCards(currentState);
    currentState = floodResult.state;
    events.push(...floodResult.events);

    // If someone needs to swim, handle it
    // For disconnected turn skip, we can't really make choices,
    // so just pick the first valid swim position
    while (currentState.phase === 'swim' && currentState.swimmingPlayerId) {
      const swimmer = currentState.players.find(
        (p) => p.id === currentState.swimmingPlayerId,
      );
      if (!swimmer) break;

      const swimPositions = getValidSwimPositionsImported(currentState, swimmer);
      if (swimPositions.length === 0) break; // Player drowned -- loss already handled

      const swimResult = processAction(currentState, swimmer.id, {
        type: 'swim',
        targetPosition: swimPositions[0],
      });
      currentState = swimResult.state;
      events.push(...swimResult.events);
    }

    if (currentState.phase === 'draw_flood') {
      currentState = advanceToNextTurn(currentState);
      const nextPlayer = currentState.players[currentState.currentPlayerIndex];
      events.push({
        type: 'game:turn_changed',
        currentPlayerIndex: currentState.currentPlayerIndex,
        playerId: nextPlayer.id,
      });
    }
  }

  return { state: currentState, events };
}
