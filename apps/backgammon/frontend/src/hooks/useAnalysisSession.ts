import { useState, useCallback } from "react";
import type {
  GameState,
  Color,
  AnalysisGameState,
  AnalysisMoveRecord,
  AnalysisHintResult,
  AnalysisEvalResult,
  AnalysisSettings,
  AnalysisConfig,
} from "../types/game";
import * as api from "../services/api";

export interface AnalysisSessionHook {
  // Session
  sessionId: string | null;
  sessionStatus: string;
  playerColor: Color;
  loading: boolean;
  error: string | null;
  clearError: () => void;

  // Game state
  gameState: GameState | null;
  isLivePosition: boolean;
  currentMoveIndex: number;
  totalMoves: number;

  // Game actions
  roll: () => Promise<void>;
  makeMove: (from: number, to: number) => Promise<void>;
  endTurn: () => Promise<void>;
  undoMove: () => Promise<void>;
  offerDouble: () => Promise<void>;
  respondToDouble: (accept: boolean) => Promise<void>;

  // Analysis
  hint: AnalysisHintResult | null;
  evaluation: AnalysisEvalResult | null;
  getHint: () => Promise<void>;
  getEval: () => Promise<void>;
  hintLoading: boolean;
  evalLoading: boolean;

  // Navigation
  navigateFirst: () => Promise<void>;
  navigatePrev: () => Promise<void>;
  navigateNext: () => Promise<void>;
  navigateLast: () => Promise<void>;
  jumpToMove: (n: number) => Promise<void>;

  // Move history
  moveHistory: AnalysisMoveRecord[];
  refreshHistory: () => Promise<void>;

  // Annotations
  annotateMove: (moveNumber: number, note: string) => Promise<void>;

  // Load
  loadFromGame: (tableId: string, moveNumber?: number) => Promise<void>;

  // Settings
  settings: AnalysisSettings;
  updateSettings: (s: Partial<AnalysisSettings>) => Promise<void>;

  // Create / fetch
  createSession: (config: AnalysisConfig) => Promise<string>;
  fetchSession: (id: string) => Promise<void>;
}

export function useAnalysisSession(): AnalysisSessionHook {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState("active");
  const [playerColor, setPlayerColor] = useState<Color>("white");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [totalMoves, setTotalMoves] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<AnalysisHintResult | null>(null);
  const [evaluation, setEvaluation] = useState<AnalysisEvalResult | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [moveHistory, setMoveHistory] = useState<AnalysisMoveRecord[]>([]);
  const [settings, setSettings] = useState<AnalysisSettings>({
    gnubg_ply: 2,
    auto_analysis: "off",
  });

  const clearError = useCallback(() => setError(null), []);

  const applyState = useCallback((data: AnalysisGameState) => {
    setGameState(data.game_state);
    setCurrentMoveIndex(data.current_view_index);
    setTotalMoves(data.move_count);
    setSessionStatus(data.session.status);
    setPlayerColor(data.session.player_color as Color);
    setSessionId(data.session.id);
  }, []);

  const withErrorHandling = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "An error occurred");
    }
  }, []);

  const createSession = useCallback(
    async (config: AnalysisConfig): Promise<string> => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.createAnalysisSession(config);
        applyState(data);
        setSettings({ gnubg_ply: config.gnubg_ply, auto_analysis: config.auto_analysis });
        return data.session.id;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create session");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [applyState],
  );

  const fetchSession = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getAnalysisSession(id);
        applyState(data);
        // Also fetch history
        const history = await api.analysisHistory(id);
        setMoveHistory(history);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load session");
      } finally {
        setLoading(false);
      }
    },
    [applyState],
  );

  // Game actions
  const roll = useCallback(async () => {
    if (!sessionId) return;
    await withErrorHandling(async () => {
      const data = await api.analysisRoll(sessionId);
      applyState(data);
      setHint(null);
    });
  }, [sessionId, applyState, withErrorHandling]);

  const makeMove = useCallback(
    async (from: number, to: number) => {
      if (!sessionId) return;
      await withErrorHandling(async () => {
        const data = await api.analysisMove(sessionId, from, to);
        applyState(data);
      });
    },
    [sessionId, applyState, withErrorHandling],
  );

  const endTurn = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    await withErrorHandling(async () => {
      const data = await api.analysisEndTurn(sessionId);
      applyState(data);
      setHint(null);
      setEvaluation(null);
      // Refresh history
      const history = await api.analysisHistory(sessionId);
      setMoveHistory(history);
    });
    setLoading(false);
  }, [sessionId, applyState, withErrorHandling]);

  const undoMove = useCallback(async () => {
    if (!sessionId) return;
    await withErrorHandling(async () => {
      const data = await api.analysisUndo(sessionId);
      applyState(data);
    });
  }, [sessionId, applyState, withErrorHandling]);

  const offerDouble = useCallback(async () => {
    if (!sessionId) return;
    await withErrorHandling(async () => {
      const data = await api.analysisDouble(sessionId);
      applyState(data);
    });
  }, [sessionId, applyState, withErrorHandling]);

  const respondToDouble = useCallback(
    async (accept: boolean) => {
      if (!sessionId) return;
      await withErrorHandling(async () => {
        const data = await api.analysisRespondDouble(sessionId, accept);
        applyState(data);
      });
    },
    [sessionId, applyState, withErrorHandling],
  );

  // Analysis
  const getHint = useCallback(async () => {
    if (!sessionId) return;
    setHintLoading(true);
    try {
      const result = await api.analysisHint(sessionId);
      setHint(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get hint");
    } finally {
      setHintLoading(false);
    }
  }, [sessionId]);

  const getEval = useCallback(async () => {
    if (!sessionId) return;
    setEvalLoading(true);
    try {
      const result = await api.analysisEval(sessionId);
      setEvaluation(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to evaluate position");
    } finally {
      setEvalLoading(false);
    }
  }, [sessionId]);

  // Navigation
  const navigate = useCallback(
    async (direction: "first" | "prev" | "next" | "last") => {
      if (!sessionId) return;
      await withErrorHandling(async () => {
        const data = await api.analysisNavigate(sessionId, direction);
        applyState(data);
      });
    },
    [sessionId, applyState, withErrorHandling],
  );

  const navigateFirst = useCallback(() => navigate("first"), [navigate]);
  const navigatePrev = useCallback(() => navigate("prev"), [navigate]);
  const navigateNext = useCallback(() => navigate("next"), [navigate]);
  const navigateLast = useCallback(() => navigate("last"), [navigate]);

  const jumpToMove = useCallback(
    async (n: number) => {
      if (!sessionId) return;
      await withErrorHandling(async () => {
        const data = await api.analysisJump(sessionId, n);
        applyState(data);
      });
    },
    [sessionId, applyState, withErrorHandling],
  );

  // History
  const refreshHistory = useCallback(async () => {
    if (!sessionId) return;
    try {
      const history = await api.analysisHistory(sessionId);
      setMoveHistory(history);
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  // Annotations
  const annotateMove = useCallback(
    async (moveNumber: number, note: string) => {
      if (!sessionId) return;
      await api.analysisAnnotate(sessionId, moveNumber, note);
      await refreshHistory();
    },
    [sessionId, refreshHistory],
  );

  // Load game
  const loadFromGame = useCallback(
    async (tableId: string, moveNumber?: number) => {
      if (!sessionId) return;
      setLoading(true);
      await withErrorHandling(async () => {
        const data = await api.analysisLoadGame(sessionId, tableId, moveNumber);
        applyState(data);
        const history = await api.analysisHistory(sessionId);
        setMoveHistory(history);
      });
      setLoading(false);
    },
    [sessionId, applyState, withErrorHandling],
  );

  // Settings
  const updateSettings = useCallback(
    async (s: Partial<AnalysisSettings>) => {
      if (!sessionId) return;
      await withErrorHandling(async () => {
        const data = await api.analysisUpdateSettings(sessionId, s);
        applyState(data);
        setSettings((prev) => ({ ...prev, ...s }));
      });
    },
    [sessionId, applyState, withErrorHandling],
  );

  return {
    sessionId,
    sessionStatus,
    playerColor,
    loading,
    error,
    clearError,
    gameState,
    isLivePosition: currentMoveIndex === -1,
    currentMoveIndex,
    totalMoves,
    roll,
    makeMove,
    endTurn,
    undoMove,
    offerDouble,
    respondToDouble,
    hint,
    evaluation,
    getHint,
    getEval,
    hintLoading,
    evalLoading,
    navigateFirst,
    navigatePrev,
    navigateNext,
    navigateLast,
    jumpToMove,
    moveHistory,
    refreshHistory,
    annotateMove,
    loadFromGame,
    settings,
    updateSettings,
    createSession,
    fetchSession,
  };
}
