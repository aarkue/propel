const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const STEPS = [
  1000,
  2000,
  5000,
  10_000,
  15_000,
  30_000,
  MINUTE,
  2 * MINUTE,
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
  7 * DAY,
  14 * DAY,
];

/**
 * About `n` tick times between `lo` and `hi`: month or year starts for long windows, whole steps
 * (seconds to weeks) for shorter ones, and evenly spaced inner points when neither gives two ticks.
 */
export function timeTicks(lo: number, hi: number, n = 7): number[] {
  const span = Math.max(1, hi - lo);
  const months = [1, 3, 6, 12, 24, 60, 120, 240, 600].find((m) => span / (m * 30 * DAY) <= n);
  if (months) {
    const out: number[] = [];
    const d = new Date(lo);
    let y = d.getFullYear();
    let m = Math.ceil((d.getMonth() + (d.getDate() > 1 ? 1 : 0)) / months) * months;
    for (;;) {
      y += Math.floor(m / 12);
      m %= 12;
      const t = new Date(y, m, 1).getTime();
      if (t > hi) break;
      if (t >= lo) out.push(t);
      m += months;
    }
    if (out.length >= 2) return out;
  }
  const step = STEPS.find((st) => span / st <= n);
  if (step) {
    const out: number[] = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t);
    if (out.length >= 2) return out;
  }
  return Array.from({ length: Math.max(1, n - 1) }, (_, i) => lo + (span * (i + 1)) / n);
}

/** A tick's label, as precise as a window of `span` ms needs. */
export function timeTickLabel(t: number, span: number): string {
  const d = new Date(t);
  if (span < 10 * MINUTE) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  if (span < 3 * DAY) {
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (span > 3 * 365 * DAY && d.getMonth() === 0 && d.getDate() === 1) return String(d.getFullYear());
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: span < 120 * DAY ? "numeric" : undefined,
  });
}
