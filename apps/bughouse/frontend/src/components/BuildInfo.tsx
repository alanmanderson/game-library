import React, { useState, useEffect, useRef } from 'react';

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'fixed',
    bottom: 12,
    right: 12,
    zIndex: 50,
  },
  button: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: '1px solid #666',
    background: '#22223a',
    color: '#999',
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
    transition: 'opacity 0.15s ease',
  },
  dropdown: {
    position: 'absolute',
    bottom: 36,
    right: 0,
    background: '#22223a',
    border: '1px solid #666',
    borderRadius: 8,
    padding: '10px 14px',
    minWidth: 150,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    color: '#e0e0e0',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: '1px solid rgba(102,102,102,0.2)',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '2px 0',
  },
  label: {
    fontSize: 11,
    color: '#999',
  },
  value: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#e0e0e0',
  },
};

const BuildInfo: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [beVersion, setBeVersion] = useState<string>('...');
  const ref = useRef<HTMLDivElement>(null);

  const feVersion = (process.env.REACT_APP_GIT_SHA || 'dev').slice(0, 7);

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
    <div style={styles.wrapper} ref={ref}>
      {open && (
        <div style={styles.dropdown}>
          <div style={styles.title}>About</div>
          <div style={styles.row}>
            <span style={styles.label}>Build</span>
            <code style={styles.value}>{feVersion}</code>
          </div>
          <div style={styles.row}>
            <span style={styles.label}>Server</span>
            <code style={styles.value}>{beVersion}</code>
          </div>
        </div>
      )}
      <button
        style={{ ...styles.button, ...(open ? { opacity: 1 } : {}) }}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.opacity = '0.5';
        }}
        aria-label="Build information"
        title="Build information"
      >
        ?
      </button>
    </div>
  );
};

export default BuildInfo;
