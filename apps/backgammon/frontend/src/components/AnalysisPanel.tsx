import type { AnalysisPanelTab } from "../types/game";
import type { AnalysisSessionHook } from "../hooks/useAnalysisSession";
import AnalysisMovesTab from "./AnalysisMovesTab";
import AnalysisEvalTab from "./AnalysisEvalTab";
import AnalysisSettingsTab from "./AnalysisSettingsTab";
import "./styles/AnalysisPanel.css";

interface AnalysisPanelProps {
  session: AnalysisSessionHook;
  activeTab: AnalysisPanelTab;
  onTabChange: (tab: AnalysisPanelTab) => void;
}

function AnalysisPanel({
  session,
  activeTab,
  onTabChange,
}: AnalysisPanelProps) {
  const tabs: { key: AnalysisPanelTab; label: string }[] = [
    { key: "moves", label: "Moves" },
    { key: "analysis", label: "Analysis" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="analysis-panel">
      {/* Analysis toolbar */}
      <div className="analysis-panel__toolbar">
        <button
          className={`analysis-panel__toolbar-btn${session.hint ? " analysis-panel__toolbar-btn--active" : ""}`}
          onClick={session.getHint}
          disabled={session.hintLoading}
        >
          {session.hintLoading ? "..." : "Hint"}
          <span className="analysis-panel__toolbar-kbd">H</span>
        </button>
        <button
          className={`analysis-panel__toolbar-btn${session.evaluation ? " analysis-panel__toolbar-btn--active" : ""}`}
          onClick={session.getEval}
          disabled={session.evalLoading}
        >
          {session.evalLoading ? "..." : "Eval"}
          <span className="analysis-panel__toolbar-kbd">E</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="analysis-panel__tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`analysis-panel__tab${activeTab === t.key ? " analysis-panel__tab--active" : ""}`}
            onClick={() => onTabChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="analysis-panel__body">
        {activeTab === "moves" && (
          <AnalysisMovesTab
            moveHistory={session.moveHistory}
            currentMoveIndex={session.currentMoveIndex}
            playerColor={session.playerColor}
            onJumpToMove={session.jumpToMove}
          />
        )}
        {activeTab === "analysis" && (
          <AnalysisEvalTab
            hint={session.hint}
            evaluation={session.evaluation}
            hintLoading={session.hintLoading}
            evalLoading={session.evalLoading}
          />
        )}
        {activeTab === "settings" && (
          <AnalysisSettingsTab
            settings={session.settings}
            onUpdate={session.updateSettings}
          />
        )}
      </div>

      {/* Navigation bar */}
      <div className="analysis-nav">
        <button
          className="analysis-nav__btn"
          onClick={session.navigateFirst}
          disabled={session.totalMoves === 0}
          title="First move (Home)"
        >
          &#9198;
        </button>
        <button
          className="analysis-nav__btn"
          onClick={session.navigatePrev}
          disabled={session.totalMoves === 0}
          title="Previous move (\u2190)"
        >
          &#9664;
        </button>
        <span className="analysis-nav__label">
          {session.currentMoveIndex === -1
            ? `Live (${session.totalMoves} moves)`
            : `Move ${session.currentMoveIndex + 1} / ${session.totalMoves}`}
        </span>
        <button
          className="analysis-nav__btn"
          onClick={session.navigateNext}
          disabled={session.currentMoveIndex === -1}
          title="Next move (\u2192)"
        >
          &#9654;
        </button>
        <button
          className="analysis-nav__btn"
          onClick={session.navigateLast}
          disabled={session.currentMoveIndex === -1}
          title="Latest position (End)"
        >
          &#9197;
        </button>
      </div>
    </div>
  );
}

export default AnalysisPanel;
