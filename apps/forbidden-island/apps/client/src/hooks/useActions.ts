import { useCallback } from 'react';
import { useStore } from '../store/store';
import type { GameAction } from '@forbidden-island/shared/types/actions';

/** Action dispatch helpers */
export function useActions() {
  const send = useStore((s) => s.send);

  const dispatch = useCallback(
    (action: GameAction) => {
      send({ type: 'game:action', action });
    },
    [send]
  );

  const move = useCallback(
    (row: number, col: number) => dispatch({ type: 'move', targetPosition: { row, col } }),
    [dispatch]
  );

  const shoreUp = useCallback(
    (row: number, col: number) => dispatch({ type: 'shore_up', targetPosition: { row, col } }),
    [dispatch]
  );

  const giveCard = useCallback(
    (cardId: string, targetPlayerId: string) => dispatch({ type: 'give_card', cardId, targetPlayerId }),
    [dispatch]
  );

  const captureTreasure = useCallback(
    (treasureType: 'earth_stone' | 'statue_of_wind' | 'crystal_of_fire' | 'oceans_chalice') =>
      dispatch({ type: 'capture_treasure', treasureType }),
    [dispatch]
  );

  const endActions = useCallback(() => dispatch({ type: 'end_actions' }), [dispatch]);

  const swim = useCallback(
    (row: number, col: number) => dispatch({ type: 'swim', targetPosition: { row, col } }),
    [dispatch]
  );

  const discard = useCallback(
    (cardId: string) => dispatch({ type: 'discard', cardId }),
    [dispatch]
  );

  const playHelicopterLift = useCallback(
    (cardId: string, playerIds: string[], row: number, col: number) =>
      dispatch({ type: 'play_helicopter_lift', cardId, playerIds, targetPosition: { row, col } }),
    [dispatch]
  );

  const playSandbags = useCallback(
    (cardId: string, row: number, col: number) =>
      dispatch({ type: 'play_sandbags', cardId, targetPosition: { row, col } }),
    [dispatch]
  );

  return {
    dispatch,
    move,
    shoreUp,
    giveCard,
    captureTreasure,
    endActions,
    swim,
    discard,
    playHelicopterLift,
    playSandbags,
  };
}
