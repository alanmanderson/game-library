import { useState, useEffect, useRef } from "react";
import styles from "./BuildInfo.module.css";

export function BuildInfo() {
  const [open, setOpen] = useState(false);
  const [beVersion, setBeVersion] = useState<string>("...");
  const ref = useRef<HTMLDivElement>(null);

  const feVersion = (import.meta.env.VITE_GIT_SHA || "dev").slice(0, 7);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setBeVersion(d.version || "?"))
      .catch(() => setBeVersion("?"));
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className={styles.wrapper} ref={ref}>
      {open && (
        <div className={styles.dropdown}>
          <div className={styles.title}>About</div>
          <div className={styles.row}>
            <span className={styles.label}>Build</span>
            <code className={styles.value}>{feVersion}</code>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Server</span>
            <code className={styles.value}>{beVersion}</code>
          </div>
        </div>
      )}
      <button
        className={styles.button}
        onClick={() => setOpen((o) => !o)}
        aria-label="Build information"
        title="Build information"
      >
        ?
      </button>
    </div>
  );
}
