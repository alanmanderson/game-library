/**
 * Platform-agnostic hook that owns the in-game reducer, dispatches WsEvents,
 * fires the shared client-side timers (trick-review, error auto-dismiss), and
 * bundles the action senders used by both the web and mobile game views.
 *
 * No DOM or React Native imports — the only platform coupling is `sendMessage`,
 * which the caller wires up via its own useWebSocket.
 */
import { useCallback, useEffect, useReducer } from "react";
import { sendAction } from "../schemas";
import type { WsEvent } from "../types";
import {
  gameReducer,
  initialGameState,
  type GameAction,
  type GameState,
} from "../gameReducer";

type SendMessage = (msg: Record<string, unknown>) => boolean | void;

export interface UseGameStateOptions {
  /** Current player's seat (e.g. "north"). Case is normalized internally. */
  mySeat: string | null;
  /** Returned from useWebSocket on the host platform. */
  sendMessage: SendMessage;
}

export interface UseGameStateApi {
  state: GameState;
  dispatch: (action: GameAction) => void;
  /** Feed a server WsEvent into the reducer. No-op for events the reducer ignores. */
  applyEvent: (event: WsEvent) => void;
  /** Optimistic card play: snapshot hand, disable legal cards, send PLAY_CARD. */
  playCard: (card: string) => void;
  /** Mark rematch requested locally, send REMATCH_REQUEST. */
  requestRematch: () => void;
  /** Send ACKNOWLEDGE_HAND_RESULT (server will broadcast the ACK back to us). */
  acknowledgeHandResult: () => void;
  /** Send LEAVE_TO_LOBBY (server broadcasts LEFT_TO_LOBBY; caller handles nav). */
  leaveToLobby: () => void;
}

export function useGameState({
  mySeat,
  sendMessage,
}: UseGameStateOptions): UseGameStateApi {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    initialGameState([]),
  );

  const mySeatUpper = (mySeat ?? "").toUpperCase();

  const applyEvent = useCallback(
    (event: WsEvent) => {
      dispatch({ type: "WS_EVENT", event, mySeat: mySeatUpper });
    },
    [mySeatUpper],
  );

  const playCard = useCallback(
    (card: string) => {
      dispatch({ type: "OPTIMISTIC_PLAY", card });
      sendAction(sendMessage, { action: "PLAY_CARD", payload: { card } });
    },
    [sendMessage],
  );

  const requestRematch = useCallback(() => {
    dispatch({ type: "REQUEST_REMATCH" });
    sendAction(sendMessage, { action: "REMATCH_REQUEST", payload: {} });
  }, [sendMessage]);

  const acknowledgeHandResult = useCallback(() => {
    sendAction(sendMessage, { action: "ACKNOWLEDGE_HAND_RESULT", payload: {} });
  }, [sendMessage]);

  const leaveToLobby = useCallback(() => {
    sendAction(sendMessage, { action: "LEAVE_TO_LOBBY", payload: {} });
  }, [sendMessage]);

  // 2-second trick-review timer: when TRICK_COMPLETED lands, the reducer sets
  // `trickResult`; we clear it after a pause so the next trick starts fresh.
  // The 12th trick is the last, so we do not auto-advance off it.
  const trickResult = state.trickResult;
  useEffect(() => {
    if (!trickResult) return;
    if (trickResult.trick_number >= 12) return;
    const nextNum = trickResult.trick_number + 1;
    const id = setTimeout(() => {
      dispatch({ type: "CLEAR_TRICK_DISPLAY", nextTrickNumber: nextNum });
    }, 2000);
    return () => clearTimeout(id);
  }, [trickResult]);

  // 5-second error auto-dismiss.
  const error = state.error;
  useEffect(() => {
    if (error === null) return;
    const id = setTimeout(() => dispatch({ type: "CLEAR_ERROR" }), 5000);
    return () => clearTimeout(id);
  }, [error]);

  return {
    state,
    dispatch,
    applyEvent,
    playCard,
    requestRematch,
    acknowledgeHandResult,
    leaveToLobby,
  };
}
