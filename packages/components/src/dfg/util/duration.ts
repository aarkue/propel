/** Format milliseconds into a compact human-readable string. */
export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)}m`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  const d = h / 24;
  return `${d.toFixed(1)}d`;
}

/** Interpolate between cold (blue) -> warm (yellow) -> hot (red) based on t in [0,1]. */
export function durationColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  let r: number, g: number, b: number;
  if (clamped < 0.5) {
    const p = clamped / 0.5;
    r = Math.round(30 + (240 - 30) * p);
    g = Math.round(100 + (200 - 100) * p);
    b = Math.round(220 + (40 - 220) * p);
  } else {
    const p = (clamped - 0.5) / 0.5;
    r = Math.round(240 + (210 - 240) * p);
    g = Math.round(200 + (50 - 200) * p);
    b = Math.round(40 + (40 - 40) * p);
  }
  return `rgb(${r},${g},${b})`;
}
