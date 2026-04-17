import type { AnalysisSettings } from "../types/game";

interface Props {
  settings: AnalysisSettings;
  onUpdate: (s: Partial<AnalysisSettings>) => void;
}

function AnalysisSettingsTab({ settings, onUpdate }: Props) {
  return (
    <div className="analysis-settings">
      <div className="analysis-settings__row">
        <span className="analysis-settings__label">Evaluation depth</span>
        <select
          className="analysis-settings__select"
          value={settings.gnubg_ply}
          onChange={(e) => onUpdate({ gnubg_ply: Number(e.target.value) })}
        >
          <option value={0}>0-ply (instant)</option>
          <option value={1}>1-ply</option>
          <option value={2}>2-ply (default)</option>
          <option value={3}>3-ply (slow)</option>
        </select>
      </div>

      <div className="analysis-settings__row">
        <span className="analysis-settings__label">Auto-analysis</span>
        <select
          className="analysis-settings__select"
          value={settings.auto_analysis}
          onChange={(e) => onUpdate({ auto_analysis: e.target.value })}
        >
          <option value="off">Off</option>
          <option value="per_move">After each move</option>
          <option value="per_turn">After each turn</option>
        </select>
      </div>
    </div>
  );
}

export default AnalysisSettingsTab;
