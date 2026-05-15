/**
 * Procedural sound cues via the Web Audio API.
 *
 * Everything is synthesized from oscillators + gain envelopes so we ship zero
 * binary assets. Each cue is a few lines — a pluck, a slap, a whoosh, a chime
 * — which is plenty for a card game's UI feedback. If a designer wants richer
 * samples later, swap `playSound` to load real AudioBuffers; the call sites
 * stay the same.
 *
 * Autoplay policies require a user gesture before the first sound will play.
 * We lazily create the `AudioContext` on the first `playSound()` call, which
 * happens from a click/keyboard handler (dealing cards runs after a user
 * enters a room, which is a gesture — this is good enough in practice; if
 * the browser still blocks, `ctx.resume()` is also called).
 *
 * Mute + volume are read from localStorage on every call so a toggle in the
 * header takes effect immediately without prop plumbing.
 */

export type SoundName =
  | "card_flip"
  | "card_slap"
  | "trick_sweep"
  | "bid_chime"
  | "moon_chime";

const ENABLED_KEY = "audio_enabled";
const VOLUME_KEY = "audio_volume";
const DEFAULT_VOLUME = 0.5;

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) {
    // If a prior user gesture left the context suspended (common on Safari /
    // Chrome autoplay), a new gesture-driven playSound can resume it.
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(ENABLED_KEY);
    // Default to enabled — issue #1 says "default 0.5, user can mute".
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function readVolume(): number {
  if (typeof window === "undefined") return DEFAULT_VOLUME;
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_VOLUME;
    return Math.max(0, Math.min(1, n));
  } catch {
    return DEFAULT_VOLUME;
  }
}

interface PlayOptions {
  /** 0..1 multiplier applied on top of the user's global volume. */
  gain?: number;
}

// --- Voices --------------------------------------------------------------
//
// Each voice is a short procedural patch. They all follow the same shape:
//   1. create oscillator(s) + a gain node
//   2. schedule a fast attack + exponential decay envelope
//   3. start + stop the oscillators (which garbage-collects the nodes)
//
// Keep each one under ~200ms so cues never stack on top of each other during
// a 40ms-staggered deal.

function playCardFlip(c: AudioContext, out: GainNode) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "triangle";
  // A short high pluck (~A6 → A5) with a sharp decay mimics a fingernail
  // riffling a card edge.
  osc.frequency.setValueAtTime(1760, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, c.currentTime + 0.08);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.1);
  osc.connect(g).connect(out);
  osc.start();
  osc.stop(c.currentTime + 0.12);
}

function playCardSlap(c: AudioContext, out: GainNode) {
  // Noise burst through a low-pass: a percussive "thwack" when a card lands.
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * 0.12), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    // Fade out quickly so we get a crack rather than a hiss.
    const env = Math.pow(1 - i / data.length, 2);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1200;
  const g = c.createGain();
  g.gain.value = 0.35;
  src.connect(filter).connect(g).connect(out);
  src.start();
}

function playTrickSweep(c: AudioContext, out: GainNode) {
  // Downward whoosh — two detuned saws swept from ~900Hz to ~200Hz with
  // heavy low-pass for a soft brushing sound.
  const now = c.currentTime;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1400, now);
  filter.frequency.exponentialRampToValueAtTime(400, now + 0.3);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
  for (const detune of [-7, 7]) {
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);
    osc.connect(filter);
    osc.start(now);
    osc.stop(now + 0.32);
  }
  filter.connect(g).connect(out);
}

function playBidChime(c: AudioContext, out: GainNode) {
  // Two-note bell: a fifth (E5 + B5) with a longer decay — bright but not
  // intrusive. Plays whenever any player's bid is announced.
  const now = c.currentTime;
  const notes = [659.25, 987.77];
  for (const [i, freq] of notes.entries()) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const delay = i * 0.04;
    g.gain.setValueAtTime(0.0001, now + delay);
    g.gain.exponentialRampToValueAtTime(0.14, now + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.45);
    osc.connect(g).connect(out);
    osc.start(now + delay);
    osc.stop(now + delay + 0.5);
  }
}

function playMoonChime(c: AudioContext, out: GainNode) {
  // Triumphant arpeggio: E5 → G#5 → B5 → E6, sine waves stacked for a
  // shimmery "shot the moon" payoff.
  const now = c.currentTime;
  const notes = [659.25, 830.61, 987.77, 1318.51];
  for (const [i, freq] of notes.entries()) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const delay = i * 0.08;
    g.gain.setValueAtTime(0.0001, now + delay);
    g.gain.exponentialRampToValueAtTime(0.18, now + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.6);
    osc.connect(g).connect(out);
    osc.start(now + delay);
    osc.stop(now + delay + 0.65);
  }
}

const VOICES: Record<SoundName, (c: AudioContext, out: GainNode) => void> = {
  card_flip: playCardFlip,
  card_slap: playCardSlap,
  trick_sweep: playTrickSweep,
  bid_chime: playBidChime,
  moon_chime: playMoonChime,
};

export function playSound(name: SoundName, options: PlayOptions = {}): void {
  if (!readEnabled()) return;
  const c = getCtx();
  if (!c) return;
  const master = c.createGain();
  master.gain.value = readVolume() * (options.gain ?? 1);
  master.connect(c.destination);
  try {
    VOICES[name](c, master);
  } catch {
    // Never let an audio failure take down the UI.
  }
}

// Exposed for tests / the mute toggle.
export const AUDIO_STORAGE_KEYS = {
  enabled: ENABLED_KEY,
  volume: VOLUME_KEY,
} as const;
