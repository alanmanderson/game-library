/**
 * Reconnect-backoff jitter.
 *
 * Returns a delay in `[base/2, base]` ms. This is "equal jitter" style
 * (Marc Brooker, AWS Architecture Blog): half the base is fixed, half is
 * random. It preserves the intended exponential-ish backoff shape (delays
 * never collapse to ~0, never exceed `base`) while desynchronizing many
 * clients that disconnected at the same instant — e.g. four players in a
 * room when the server restarts.
 *
 * Without jitter a fleet of N clients all sleep the same `base` ms and
 * stampede the server in a tight burst on every reconnect tier.
 */
export function withJitter(baseMs: number): number {
  const half = baseMs / 2;
  return half + Math.random() * half;
}
