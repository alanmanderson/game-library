import { useState, useCallback } from "react";
import { getAuth } from "../api/client.ts";
import { useAuth } from "../auth/AuthContext.tsx";

interface HintResult {
  phase: string;
  suggestion: Record<string, unknown>;
}

export function useHint(roomCode: string, enabled: boolean) {
  const { token } = useAuth();
  const [hint, setHint] = useState<HintResult | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHint = useCallback(async () => {
    if (!enabled || !token) return;
    setLoading(true);
    try {
      const data = await getAuth<HintResult>(`/games/${roomCode}/hint`, token);
      setHint(data);
    } catch {
      // Silently fail — hints are non-critical
    } finally {
      setLoading(false);
    }
  }, [roomCode, enabled, token]);

  const clearHint = useCallback(() => setHint(null), []);

  return { hint, loading, fetchHint, clearHint };
}
