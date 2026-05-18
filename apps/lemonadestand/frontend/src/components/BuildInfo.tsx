import { useState, useEffect, useRef } from 'react';

export default function BuildInfo() {
  const [open, setOpen] = useState(false);
  const [beVersion, setBeVersion] = useState<string>('...');
  const ref = useRef<HTMLDivElement>(null);

  const feVersion = (import.meta.env.VITE_GIT_SHA || 'dev').slice(0, 7);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setBeVersion(d.version || '?'))
      .catch(() => setBeVersion('?'));
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="fixed bottom-3 right-3 z-50">
      {open && (
        <div className="absolute bottom-9 right-0 bg-white rounded-xl shadow-xl border border-gray-200 px-3.5 py-2.5 min-w-[150px]">
          <div className="text-[11px] font-semibold text-ink mb-2 pb-1.5 border-b border-gray-100">About</div>
          <div className="flex justify-between items-center gap-3 py-0.5">
            <span className="text-[11px] text-ink-lighter">Build</span>
            <code className="text-[11px] font-mono text-ink">{feVersion}</code>
          </div>
          <div className="flex justify-between items-center gap-3 py-0.5">
            <span className="text-[11px] text-ink-lighter">Server</span>
            <code className="text-[11px] font-mono text-ink">{beVersion}</code>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Build information"
        title="Build information"
        className={`w-7 h-7 rounded-full border border-gray-300 bg-white text-gray-400 font-mono text-sm font-bold
          flex items-center justify-center cursor-pointer transition-opacity duration-150
          ${open ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
      >
        ?
      </button>
    </div>
  );
}
