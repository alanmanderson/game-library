import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { GameState, Color, Table, WSMessage, HintMove, ChatMessage } from "../types/game";
import type { AnimatingMove } from "../components/Board";
import { useWebSocket } from "./useWebSocket";
import { STORAGE_KEY } from "../constants";

const MAX_HINTS_PER_GAME = 3;

/**
 * Detect a single checker move by comparing previous and new game states.
 */
function detectMove(prev: GameState, next: GameState): AnimatingMove | null {
  if (prev.status !== "moving") return null;

  const movingColor = prev.current_turn;

  function colorCount(val: number, color: Color): number {
    if (color === "white") return val > 0 ? val : 0;
    return val < 0 ? -val : 0;
  }

  let fromPoint = -1;
  let toPoint = -1;
  let changes = 0;

  for (let i = 1; i <= 24; i++) {
    const prevCount = colorCount(prev.points[i], movingColor);
    const nextCount = colorCount(next.points[i], movingColor);
    if (nextCount < prevCount) { fromPoint = i; changes++; }
    if (nextCount > prevCount) { toPoint = i; changes++; }
  }

  if (movingColor === "white" && next.bar_white < prev.bar_white) { fromPoint = 25; changes++; }
  if (movingColor === "black" && next.bar_black < prev.bar_black) { fromPoint = 0; changes++; }
  if (movingColor === "white" && next.off_white > prev.off_white) { toPoint = 0; changes++; }
  if (movingColor === "black" && next.off_black > prev.off_black) { toPoint = 25; changes++; }

  if (changes === 2 && fromPoint >= 0 && toPoint >= 0) {
    return { from_point: fromPoint, to_point: toPoint, color: movingColor };
  }
  return null;
}

export interface GameActions {
  rollDice: () => void;
  endTurn: () => void;
  undoTurn: () => void;
  offerDouble: () => void;
  acceptDouble: () => void;
  declineDouble: () => void;
  nextGame: () => void;
  makeMove: (fromPoint: number, toPoint: number) => void;
  requestHint: () => void;
  sendChat: (message: string) => void;
  resign: () => void;
}

export interface GameStateHook {
  gameState: GameState | null;
  myColor: Color | null;
  table: Table | null;
  playerId: string | undefined;
  selectedPoint: number | null;
  setSelectedPoint: React.Dispatch<React.SetStateAction<number | null>>;
  error: string | null;
  waitingForOpponent: boolean;
  opponentConnected: boolean;
  opponentReconnected: boolean;
  isConnected: boolean;
  animatingMove: AnimatingMove | null;
  whiteTimeMs: number | null;
  blackTimeMs: number | null;
  timeControl: string;
  actions: GameActions;
  hintMoves: HintMove[];
  hintsRemaining: number;
  chatMessages: ChatMessage[];
  /** Current display/priority order for the two dice: [firstDie, secondDie]. Larger die is first by default. */
  diceOrder: number[];
  /** Swap the dice order so the other die is tried first on checker click. */
  swapDice: () => void;
  /** True while a move has been sent to the server but not yet confirmed. Blocks rapid double-clicks. */
  moveInFlight: boolean;
}

export function useGameState(tableId: string | undefined): GameStateHook {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myColor, setMyColor] = useState<Color | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(true);
  const [opponentReconnected, setOpponentReconnected] = useState(false);
  const [animatingMove, setAnimatingMove] = useState<AnimatingMove | null>(null);
  const [hintMoves, setHintMoves] = useState<HintMove[]>([]);
  const [hintsRemaining, setHintsRemaining] = useState(MAX_HINTS_PER_GAME);
  const [diceOrder, setDiceOrder] = useState<number[]>([]);
  const [moveInFlight, setMoveInFlight] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const prevGameStateRef = useRef<GameState | null>(null);
  const myColorRef = useRef<Color | null>(null);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [whiteTimeMs, setWhiteTimeMs] = useState<number | null>(null);
  const [blackTimeMs, setBlackTimeMs] = useState<number | null>(null);
  const [timeControl, setTimeControl] = useState<string>("unlimited");
  const lastSyncRef = useRef<number>(Date.now());

  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reconnectedTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clockIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const player = useMemo(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  }, []);

  const playerId = player?.id;

  const wsUrl = useMemo(() => {
    if (!tableId || !playerId) return "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/${tableId}/${playerId}`;
  }, [tableId, playerId]);

  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case "game_state":
        if (message.data.game_state) {
          const prevGS = prevGameStateRef.current;
          const newGS = message.data.game_state;
          if (prevGS && prevGS.current_turn !== myColorRef.current) {
            const move = detectMove(prevGS, newGS);
            if (move) {
              setAnimatingMove(move);
              if (animTimerRef.current) clearTimeout(animTimerRef.current);
              animTimerRef.current = setTimeout(() => setAnimatingMove(null), 400);
            }
          }
          // Reset dice order on a fresh roll (all dice still remaining).
          if (newGS.dice) {
            const expectedCount = newGS.dice.die1 === newGS.dice.die2 ? 4 : 2;
            if (newGS.remaining_dice.length === expectedCount) {
              const d1 = newGS.dice.die1, d2 = newGS.dice.die2;
              setDiceOrder([Math.max(d1, d2), Math.min(d1, d2)]);
            }
          } else {
            setDiceOrder([]);
          }
          setMoveInFlight(false);
          prevGameStateRef.current = newGS;
          setGameState(message.data.game_state);
          const gs = message.data.game_state;
          if (gs.white_time_remaining_ms != null) setWhiteTimeMs(gs.white_time_remaining_ms);
          if (gs.black_time_remaining_ms != null) setBlackTimeMs(gs.black_time_remaining_ms);
          if (gs.time_control) setTimeControl(gs.time_control);
          lastSyncRef.current = Date.now();
        }
        if (message.data.your_color) setMyColor(message.data.your_color);
        if (message.data.table) {
          setTable(message.data.table);
          const t = message.data.table;
          if (t.white_time_remaining_ms != null) setWhiteTimeMs(t.white_time_remaining_ms);
          if (t.black_time_remaining_ms != null) setBlackTimeMs(t.black_time_remaining_ms);
          if (t.time_control) setTimeControl(t.time_control);
          lastSyncRef.current = Date.now();
        }
        setWaitingForOpponent(false);
        setError(null);
        setSelectedPoint(null);
        // Clear hint highlights on any game state update (move made, turn ended, etc.)
        setHintMoves([]);
        break;
      case "hint":
        if (message.data.suggested_moves) {
          setHintMoves(message.data.suggested_moves as HintMove[]);
          setHintsRemaining(message.data.hints_remaining as number);
          // Auto-clear hint highlight after 5 seconds
          if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
          hintTimerRef.current = setTimeout(() => setHintMoves([]), 5000);
        }
        break;
      case "chat_message":
        if (message.data.player_id && message.data.message) {
          setChatMessages((prev) => [...prev, message.data as ChatMessage]);
        }
        break;
      case "dice_rolled": break;
      case "game_over": setSelectedPoint(null); break;
      case "waiting": setWaitingForOpponent(true); break;
      case "error":
        setMoveInFlight(false);
        setError(message.data.message);
        if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = setTimeout(() => setError(null), 5000);
        break;
      case "opponent_disconnected":
        setOpponentConnected(false);
        setOpponentReconnected(false);
        break;
      case "opponent_reconnected":
        setOpponentConnected(true);
        setOpponentReconnected(true);
        if (reconnectedTimeoutRef.current) clearTimeout(reconnectedTimeoutRef.current);
        reconnectedTimeoutRef.current = setTimeout(() => setOpponentReconnected(false), 3000);
        break;
    }
  }, []);

  const handleWsOpen = useCallback(() => { setError(null); }, []);

  const { sendMessage, isConnected } = useWebSocket({
    url: wsUrl, onMessage: handleMessage, onOpen: handleWsOpen,
  });

  useEffect(() => { myColorRef.current = myColor; }, [myColor]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      if (reconnectedTimeoutRef.current) clearTimeout(reconnectedTimeoutRef.current);
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  // Client-side countdown timer
  useEffect(() => {
    if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    if (timeControl === "unlimited" || whiteTimeMs == null || blackTimeMs == null) return;
    if (!gameState || gameState.status === "finished" || gameState.status === "waiting") return;
    const isActive = gameState.status === "moving" || gameState.status === "rolling";
    if (!isActive) return;

    clockIntervalRef.current = setInterval(() => {
      if (gameState.current_turn === "white") {
        setWhiteTimeMs((prev) => (prev != null ? Math.max(0, prev - 100) : prev));
      } else {
        setBlackTimeMs((prev) => (prev != null ? Math.max(0, prev - 100) : prev));
      }
    }, 100);

    return () => { if (clockIntervalRef.current) clearInterval(clockIntervalRef.current); };
  }, [timeControl, gameState?.status, gameState?.current_turn, whiteTimeMs != null]);

  // ----- Actions -----

  const rollDice = useCallback(() => { sendMessage({ action: "roll_dice" }); }, [sendMessage]);
  const endTurn = useCallback(() => { sendMessage({ action: "end_turn" }); setSelectedPoint(null); }, [sendMessage]);
  const undoTurn = useCallback(() => { sendMessage({ action: "undo_turn" }); }, [sendMessage]);
  const offerDouble = useCallback(() => { sendMessage({ action: "offer_double" }); }, [sendMessage]);
  const acceptDouble = useCallback(() => { sendMessage({ action: "accept_double" }); }, [sendMessage]);
  const declineDouble = useCallback(() => { sendMessage({ action: "decline_double" }); }, [sendMessage]);
  const nextGame = useCallback(() => { sendMessage({ action: "next_game" }); }, [sendMessage]);
  const requestHint = useCallback(() => { sendMessage({ action: "request_hint" }); }, [sendMessage]);
  const sendChat = useCallback((text: string) => { sendMessage({ action: "chat", message: text }); }, [sendMessage]);
  const resign = useCallback(() => { sendMessage({ action: "resign" }); }, [sendMessage]);

  const swapDice = useCallback(() => {
    setDiceOrder((prev) => (prev.length === 2 ? [prev[1], prev[0]] : prev));
  }, []);

  const makeMove = useCallback(
    (fromPoint: number, toPoint: number) => {
      if (myColor) {
        setAnimatingMove({ from_point: fromPoint, to_point: toPoint, color: myColor });
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        animTimerRef.current = setTimeout(() => setAnimatingMove(null), 400);
      }
      setMoveInFlight(true);
      sendMessage({ action: "make_move", from_point: fromPoint, to_point: toPoint });
      setSelectedPoint(null);
    },
    [sendMessage, myColor],
  );

  const actions = useMemo(
    () => ({ rollDice, endTurn, undoTurn, offerDouble, acceptDouble, declineDouble, nextGame, makeMove, requestHint, sendChat, resign }),
    [rollDice, endTurn, undoTurn, offerDouble, acceptDouble, declineDouble, nextGame, makeMove, requestHint, sendChat, resign],
  );

  return {
    playerId, gameState, myColor, table, selectedPoint, setSelectedPoint,
    error, waitingForOpponent, opponentConnected, opponentReconnected,
    isConnected, animatingMove, whiteTimeMs, blackTimeMs, timeControl, actions,
    hintMoves, hintsRemaining, chatMessages, diceOrder, swapDice, moveInFlight,
  };
}
