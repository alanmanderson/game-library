import { useState, useEffect, useRef } from 'react';

export function BuildInfo() {
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
    <div ref={ref} style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 50 }}>
      {open && (
        <div style={{
          position: 'absolute', bottom: 36, right: 0,
          background: 'var(--c-ink2, #0e2229)', border: '1px solid var(--c-sea, #1a4d5a)',
          borderRadius: 8, padding: '10px 14px', minWidth: 150,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: 'var(--c-parch, #f0e3c2)',
            marginBottom: 8, paddingBottom: 6,
            borderBottom: '1px solid rgba(26,77,90,0.3)',
          }}>About</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
            <span style={{ fontSize: 11, color: 'var(--c-sand3, #b1925a)' }}>Build</span>
            <code style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--c-parch, #f0e3c2)' }}>{feVersion}</code>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
            <span style={{ fontSize: 11, color: 'var(--c-sand3, #b1925a)' }}>Server</span>
            <code style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--c-parch, #f0e3c2)' }}>{beVersion}</code>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Build information"
        title="Build information"
        style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '1px solid var(--c-sea, #1a4d5a)',
          background: 'var(--c-ink2, #0e2229)',
          color: 'var(--c-sand3, #b1925a)',
          fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: open ? 1 : 0.5, transition: 'opacity 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.opacity = '0.5'; }}
      >
        ?
      </button>
    </div>
  );
}
