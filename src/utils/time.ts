/**
 * Render an epoch (seconds OR milliseconds) as a compact "X ago" — "s/m/h/d/
 * w/mo". Auto-detects unit by magnitude (anything past year-2001 in seconds is
 * treated as seconds; otherwise milliseconds). Use the explicit overload via
 * `relativeTimeFromMs` / `relativeTimeFromSeconds` if you want certainty.
 */
export function relativeTimeFromSeconds(epochSeconds: number): string {
  const seconds = Math.max(
    0,
    Math.floor(Date.now() / 1000 - epochSeconds),
  );
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 8) return `${w}w`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}

export function relativeTimeFromMs(epochMs: number): string {
  return relativeTimeFromSeconds(Math.floor(epochMs / 1000));
}
