/**
 * Build information display — a small "?" button that shows FE/BE version.
 */

let buildInfoEl: HTMLElement | null = null;
let buildInfoController: AbortController | null = null;

export function initBuildInfo(): void {
  if (buildInfoEl) return;

  const feVersion = (import.meta.env.VITE_GIT_SHA || 'dev').slice(0, 7);

  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.id = 'build-info';
  wrapper.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:50;';

  // Button
  const btn = document.createElement('button');
  btn.textContent = '?';
  btn.title = 'Build information';
  btn.setAttribute('aria-label', 'Build information');
  btn.style.cssText = `
    width:28px;height:28px;border-radius:50%;
    border:1px solid var(--c-border,#555);
    background:var(--c-surface,#2a2a3e);
    color:var(--c-text-muted,#999);
    font-family:monospace;font-size:14px;font-weight:bold;
    cursor:pointer;display:flex;align-items:center;justify-content:center;
    opacity:0.5;transition:opacity 0.15s ease;
  `;
  btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
  btn.addEventListener('mouseleave', () => { if (!dropdown.parentElement) btn.style.opacity = '0.5'; });

  // Dropdown
  const dropdown = document.createElement('div');
  dropdown.style.cssText = `
    position:absolute;bottom:36px;right:0;
    background:var(--c-surface,#2a2a3e);
    border:1px solid var(--c-border,#555);
    border-radius:8px;padding:10px 14px;min-width:150px;
    box-shadow:0 4px 12px rgba(0,0,0,0.3);
  `;
  dropdown.innerHTML = `
    <div style="font-size:11px;font-weight:600;color:var(--c-text,#e8e8e8);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(85,85,85,0.2)">About</div>
    <div style="display:flex;justify-content:space-between;gap:12px;padding:2px 0">
      <span style="font-size:11px;color:var(--c-text-muted,#999)">Build</span>
      <code style="font-size:11px;font-family:monospace;color:var(--c-text,#e8e8e8)">${feVersion}</code>
    </div>
    <div style="display:flex;justify-content:space-between;gap:12px;padding:2px 0">
      <span style="font-size:11px;color:var(--c-text-muted,#999)">Server</span>
      <code id="build-info-be" style="font-size:11px;font-family:monospace;color:var(--c-text,#e8e8e8)">...</code>
    </div>
  `;

  // Fetch BE version
  fetch('/api/health')
    .then((r) => r.json())
    .then((d) => {
      const el = dropdown.querySelector('#build-info-be');
      if (el) el.textContent = d.version || '?';
    })
    .catch(() => {
      const el = dropdown.querySelector('#build-info-be');
      if (el) el.textContent = '?';
    });

  // Toggle
  let isOpen = false;
  btn.addEventListener('click', () => {
    isOpen = !isOpen;
    if (isOpen) {
      wrapper.insertBefore(dropdown, btn);
      btn.style.opacity = '1';
    } else {
      dropdown.remove();
      btn.style.opacity = '0.5';
    }
  });

  // Click outside
  buildInfoController?.abort();
  buildInfoController = new AbortController();
  document.addEventListener('mousedown', (e) => {
    if (isOpen && !wrapper.contains(e.target as Node)) {
      isOpen = false;
      dropdown.remove();
      btn.style.opacity = '0.5';
    }
  }, { signal: buildInfoController.signal });

  wrapper.appendChild(btn);
  document.body.appendChild(wrapper);
  buildInfoEl = wrapper;
}
