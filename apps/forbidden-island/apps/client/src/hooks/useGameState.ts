import { useMemo } from 'react';
import { useStore } from '../store/store';

/** Derived selectors from game state */
export function useGameState() {
  const gameState = useStore((s) => s.gameState);
  const myId = gameState?.myPlayerId;

  const me = useMemo(
    () => gameState?.players.find((p) => p.id === myId) ?? null,
    [gameState?.players, myId]
  );

  const currentPlayer = useMemo(
    () => (gameState ? gameState.players[gameState.currentPlayerIndex] : null) ?? null,
    [gameState?.players, gameState?.currentPlayerIndex]
  );

  const isMyTurn = currentPlayer?.id === myId;

  const myHand = me?.hand ?? [];

  return {
    gameState,
    me,
    currentPlayer,
    isMyTurn,
    myHand,
    phase: gameState?.phase ?? 'waiting',
    actionsRemaining: gameState?.actionsRemaining ?? 0,
    waterLevel: gameState?.waterLevel ?? 1,
    capturedTreasures: gameState?.capturedTreasures ?? [],
    turnNumber: gameState?.turnNumber ?? 0,
  };
}
