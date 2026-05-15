import { useEffect, useRef, useCallback } from "react";
import styles from "./RulesDrawer.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  { id: "rankings", label: "Rankings" },
  { id: "bidding", label: "Bidding" },
  { id: "trump", label: "Trump" },
  { id: "meld", label: "Meld" },
  { id: "tricks", label: "Tricks" },
  { id: "scoring", label: "Scoring" },
  { id: "winning", label: "Winning" },
] as const;

export function RulesDrawer({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Focus close button on open
  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    }
  }, [open]);

  // Escape key closes
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Trap focus within the drawer
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [],
  );

  return (
    <>
      <div
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`}
        role="dialog"
        aria-label="Game rules"
        aria-modal={open || undefined}
        aria-hidden={!open || undefined}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>Pinochle Rules</h2>
          <button
            ref={closeRef}
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close rules"
          >
            &#x2715;
          </button>
        </div>

        <nav className={styles.jumpRow} aria-label="Jump to section">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#rules-${s.id}`} className={styles.jumpLink}>
              {s.label}
            </a>
          ))}
        </nav>

        <div className={styles.body}>
          <section className={styles.section}>
            <h3 id="rules-rankings" className={styles.sectionTitle}>
              Card Rankings
            </h3>
            <p>
              From highest to lowest:{" "}
              <strong>Ace &gt; Ten &gt; King &gt; Queen &gt; Jack &gt; Nine</strong>
            </p>
            <p>
              Point values for tricks: <strong>Ace = 1, Ten = 1, King = 1</strong>.
              Queen, Jack, Nine = 0. Last trick = 1 bonus point.
              25 total trick points per hand.
            </p>
            <p>
              Trump cards beat all non-trump cards regardless of rank.
            </p>
          </section>

          <section className={styles.section}>
            <h3 id="rules-bidding" className={styles.sectionTitle}>
              Bidding
            </h3>
            <p>
              Starting left of the dealer, each player bids or passes.
              The bid represents the minimum points (meld + tricks) the bidder's
              team commits to scoring.
            </p>
            <ul>
              <li>Minimum bid: <strong>25</strong></li>
              <li>Raise by at least 1</li>
              <li>A pass is permanent -- no re-entry</li>
              <li>If all three players pass, the dealer must bid 25</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3 id="rules-trump" className={styles.sectionTitle}>
              Trump &amp; Passing
            </h3>
            <p>
              The bid winner names one of the four suits as <strong>trump</strong>.
              All cards of that suit outrank every non-trump card for the hand.
            </p>
            <p>
              After trump is named, both partners on the bidding team
              simultaneously pass <strong>3 cards</strong> face-down to each other
              to consolidate melds and key cards.
            </p>
          </section>

          <section className={styles.section}>
            <h3 id="rules-meld" className={styles.sectionTitle}>
              Meld Scoring
            </h3>
            <table className={styles.meldTable}>
              <thead>
                <tr>
                  <th>Meld</th>
                  <th>Cards</th>
                  <th className={styles.pointsCol}>Pts</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Run</td><td>A-10-K-Q-J of trump</td><td className={styles.pointsCol}>15</td></tr>
                <tr><td>Double Run</td><td>Two runs in trump</td><td className={styles.pointsCol}>150</td></tr>
                <tr><td>Aces Around</td><td>An Ace in each suit</td><td className={styles.pointsCol}>10</td></tr>
                <tr><td>Double Aces</td><td>Two Aces in each suit</td><td className={styles.pointsCol}>100</td></tr>
                <tr><td>Kings Around</td><td>A King in each suit</td><td className={styles.pointsCol}>8</td></tr>
                <tr><td>Double Kings</td><td>Two Kings in each suit</td><td className={styles.pointsCol}>80</td></tr>
                <tr><td>Queens Around</td><td>A Queen in each suit</td><td className={styles.pointsCol}>6</td></tr>
                <tr><td>Double Queens</td><td>Two Queens in each suit</td><td className={styles.pointsCol}>60</td></tr>
                <tr><td>Jacks Around</td><td>A Jack in each suit</td><td className={styles.pointsCol}>4</td></tr>
                <tr><td>Double Jacks</td><td>Two Jacks in each suit</td><td className={styles.pointsCol}>40</td></tr>
                <tr><td>Pinochle</td><td>J&#9830; + Q&#9824;</td><td className={styles.pointsCol}>4</td></tr>
                <tr><td>Double Pinochle</td><td>Two J&#9830; + two Q&#9824;</td><td className={styles.pointsCol}>30</td></tr>
                <tr><td>Royal Marriage</td><td>K + Q of trump</td><td className={styles.pointsCol}>4</td></tr>
                <tr><td>Marriage</td><td>K + Q of same suit</td><td className={styles.pointsCol}>2</td></tr>
                <tr><td>Dix</td><td>9 of trump</td><td className={styles.pointsCol}>1</td></tr>
              </tbody>
            </table>
          </section>

          <section className={styles.section}>
            <h3 id="rules-tricks" className={styles.sectionTitle}>
              Trick-Play Rules
            </h3>
            <ul>
              <li>The bid winner leads the first trick.</li>
              <li><strong>Must follow suit</strong> if able.</li>
              <li>If you cannot follow suit, you <strong>must play trump</strong> if you have it.</li>
              <li>If you have neither led suit nor trump, play any card.</li>
              <li>Highest trump wins; if no trump, highest card of led suit wins.</li>
              <li>Duplicate cards: the one played <strong>first</strong> wins.</li>
              <li>Trick winner leads next.</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3 id="rules-scoring" className={styles.sectionTitle}>
              Scoring
            </h3>
            <p>
              <strong>Bidding team:</strong> If meld + trick points{" "}
              <strong>&ge; bid</strong>, they score all points. If not, they{" "}
              <strong>go set</strong>: score zero and subtract the bid from their
              cumulative total (can go negative).
            </p>
            <p>
              <strong>Non-bidding team:</strong> Always scores meld + trick points.
            </p>
            <p>
              A team that takes <strong>zero tricks</strong> scores zero meld
              and zero trick points for the hand.
            </p>
          </section>

          <section className={styles.section}>
            <h3 id="rules-winning" className={styles.sectionTitle}>
              Winning
            </h3>
            <p>
              First team to <strong>150 cumulative points</strong> at the end of
              a hand wins. If both teams reach 150 on the same hand, the{" "}
              <strong>bidding team wins</strong>.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
