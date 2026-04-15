import { useState } from "react";
import type { Player } from "../types/game";
import { updateMyPreferences } from "../services/api";
import {
  BOARD_THEMES,
  CHECKER_STYLES,
  resolveBoardTheme,
  resolveCheckerStyle,
} from "../constants/themes";
import { STORAGE_KEY } from "../constants";
import "./styles/Cosmetics.css";

interface CosmeticsProps {
  player: Player;
  /** Called with the updated Player after a successful save. */
  onPlayerUpdate?: (p: Player) => void;
}

/**
 * Cosmetics settings: pick a board theme and a checker style.
 *
 * Preferences are persisted via PATCH /api/players/me/preferences and mirrored
 * into localStorage so other mounted tabs see the change on next render.
 * Guests are shown a read-only notice because their selection can't be saved
 * across sessions.
 */
function Cosmetics({ player, onPlayerUpdate }: CosmeticsProps) {
  const [theme, setTheme] = useState<string>(resolveBoardTheme(player.board_theme));
  const [checker, setChecker] = useState<string>(
    resolveCheckerStyle(player.checker_style),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function persist(next: { board_theme?: string; checker_style?: string }) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMyPreferences(next);
      // Keep localStorage cache in sync so Game.tsx etc. see the update.
      const mergedPlayer: Player = { ...player, ...updated };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedPlayer));
      if (onPlayerUpdate) onPlayerUpdate(mergedPlayer);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function handlePickTheme(id: string) {
    setTheme(id);
    void persist({ board_theme: id });
  }

  function handlePickChecker(id: string) {
    setChecker(id);
    void persist({ checker_style: id });
  }

  return (
    <div className="cosmetics">
      <h3 className="cosmetics-heading">Board Theme</h3>
      <div className="cosmetics-grid" role="radiogroup" aria-label="Board theme">
        {BOARD_THEMES.map((t) => {
          const selected = theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t.name}
              data-testid={`theme-option-${t.id}`}
              className={`cosmetics-option${selected ? " selected" : ""}`}
              onClick={() => handlePickTheme(t.id)}
              disabled={saving}
            >
              <span
                className="cosmetics-swatch cosmetics-swatch-board"
                style={{ background: t.swatch.board }}
              >
                <span
                  className="cosmetics-swatch-dot"
                  style={{ background: t.swatch.pointDark }}
                />
                <span
                  className="cosmetics-swatch-dot"
                  style={{ background: t.swatch.pointLight }}
                />
              </span>
              <span className="cosmetics-option-name">{t.name}</span>
            </button>
          );
        })}
      </div>

      <h3 className="cosmetics-heading">Checker Style</h3>
      <div
        className="cosmetics-grid"
        role="radiogroup"
        aria-label="Checker style"
      >
        {CHECKER_STYLES.map((s) => {
          const selected = checker === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={s.name}
              data-testid={`checker-option-${s.id}`}
              className={`cosmetics-option${selected ? " selected" : ""}`}
              onClick={() => handlePickChecker(s.id)}
              disabled={saving}
            >
              <span className="cosmetics-swatch cosmetics-swatch-checkers">
                <span
                  className="cosmetics-swatch-disc"
                  style={{ background: s.swatch.white }}
                />
                <span
                  className="cosmetics-swatch-disc"
                  style={{ background: s.swatch.black }}
                />
              </span>
              <span className="cosmetics-option-name">{s.name}</span>
            </button>
          );
        })}
      </div>

      {error && <div className="cosmetics-error">{error}</div>}
      {!error && savedAt && !saving && (
        <div className="cosmetics-saved" role="status">
          Saved.
        </div>
      )}
      {player.is_guest && (
        <div className="cosmetics-guest-notice">
          Guest preferences aren't saved across sessions. Create an account to
          keep your theme.
        </div>
      )}
    </div>
  );
}

export default Cosmetics;
