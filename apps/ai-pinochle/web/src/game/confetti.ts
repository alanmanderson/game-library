/**
 * Tiny canvas confetti — no library, no DOM-per-particle.
 *
 * Spawns ~150 rectangular particles at the top of the canvas and lets gravity
 * pull them down while they spin. Pure imperative loop driven by
 * `requestAnimationFrame`; the caller mounts a full-screen <canvas> and
 * passes its 2d context plus the brand `confettiPalette`.
 *
 * The animation auto-stops when every particle has left the canvas, and
 * returns a `cancel()` so the React effect can tear it down on unmount.
 */

const PARTICLE_COUNT = 150;
const GRAVITY = 0.18;
const DRAG = 0.0035;
const MAX_LIFETIME_MS = 5000;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  size: number;
  color: string;
  shape: "rect" | "ribbon";
}

function spawn(width: number, palette: readonly string[]): Particle {
  // Spawn across the top half — feels like a confetti cannon volley rather
  // than a flat curtain.
  return {
    x: Math.random() * width,
    y: -20 - Math.random() * 80,
    vx: (Math.random() - 0.5) * 6,
    vy: Math.random() * 2 + 1,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.3,
    size: 6 + Math.random() * 6,
    color: palette[Math.floor(Math.random() * palette.length)] ?? "#fff",
    shape: Math.random() > 0.5 ? "rect" : "ribbon",
  };
}

export function runConfetti(
  canvas: HTMLCanvasElement,
  palette: readonly string[],
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const dpr = window.devicePixelRatio || 1;
  const { clientWidth: cssW, clientHeight: cssH } = canvas;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.scale(dpr, dpr);

  const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () =>
    spawn(cssW, palette),
  );

  let raf = 0;
  let cancelled = false;
  const startedAt = performance.now();

  function frame(now: number) {
    if (cancelled) return;
    ctx!.clearRect(0, 0, cssW, cssH);

    let alive = 0;
    for (const p of particles) {
      p.vy += GRAVITY;
      p.vx *= 1 - DRAG;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      if (p.y < cssH + 40) alive++;

      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rotation);
      ctx!.fillStyle = p.color;
      if (p.shape === "ribbon") {
        ctx!.fillRect(-p.size / 2, -p.size / 6, p.size, p.size / 3);
      } else {
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx!.restore();
    }

    if (alive === 0 || now - startedAt > MAX_LIFETIME_MS) return;
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, cssW, cssH);
  };
}
