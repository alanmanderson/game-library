/**
 * Format milliseconds into a display string.
 * Shows MM:SS when >= 60s, just SS when < 60s.
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return `0:${totalSeconds.toString().padStart(2, '0')}`;
}

/**
 * Determine timer visual state based on remaining seconds.
 */
export function getTimerState(ms: number): 'normal' | 'warning' | 'critical' {
  const seconds = Math.ceil(ms / 1000);
  if (seconds <= 5) return 'critical';
  if (seconds <= 10) return 'warning';
  return 'normal';
}
