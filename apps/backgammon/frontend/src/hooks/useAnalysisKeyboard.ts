import { useEffect } from "react";
import type { AnalysisSessionHook } from "./useAnalysisSession";

interface UseAnalysisKeyboardOptions {
  session: AnalysisSessionHook;
  enabled?: boolean;
}

export function useAnalysisKeyboard({
  session,
  enabled = true,
}: UseAnalysisKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      )
        return;

      const gs = session.gameState;
      if (!gs) return;

      const isMyTurn = gs.current_turn === session.playerColor;

      switch (e.key) {
        case " ":
          e.preventDefault();
          if (isMyTurn && gs.status === "rolling") session.roll();
          break;
        case "Enter":
          e.preventDefault();
          if (isMyTurn && gs.status === "moving") session.endTurn();
          break;
        case "z":
        case "Z":
          if (!e.ctrlKey && !e.metaKey) session.undoMove();
          break;
        case "d":
        case "D":
          if (isMyTurn && gs.status === "rolling" && gs.can_double)
            session.offerDouble();
          break;
        case "h":
        case "H":
          session.getHint();
          break;
        case "e":
        case "E":
          session.getEval();
          break;
        case "ArrowLeft":
          e.preventDefault();
          session.navigatePrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          session.navigateNext();
          break;
        case "Home":
          e.preventDefault();
          session.navigateFirst();
          break;
        case "End":
          e.preventDefault();
          session.navigateLast();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [session, enabled]);
}
