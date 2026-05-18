import { useState, useEffect, useRef } from "react";
import "./styles/BuildInfo.css";

function BuildInfo() {
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
    <div className="build-info" ref={ref}>
      {open && (
        <div className="build-info-dropdown">
          <div className="build-info-title">About</div>
          <div className="build-info-row">
            <span className="build-info-label">Build</span>
            <code className="build-info-value">{feVersion}</code>
          </div>
          <div className="build-info-row">
            <span className="build-info-label">Server</span>
            <code className="build-info-value">{beVersion}</code>
          </div>
        </div>
      )}
      <button
        className="build-info-button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Build information"
        title="Build information"
      >
        ?
      </button>
    </div>
  );
}

export default BuildInfo;
