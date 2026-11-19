import { formatDuration as formatDurationShort, useViewerConfig } from "@r4pm/components";

export const PAGE_SIZES = [20, 50, 100] as const;

/** Typing in a browser's filter waits this long before it queries the backend. */
export const FILTER_DEBOUNCE_MS = 250;

export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return ts;
  }
}

/** Durations in the user's chosen style. */
export function useDurationFormat(): (ms: number | null | undefined) => string {
  const f = useViewerConfig({}).format?.duration ?? formatDurationShort;
  return (ms) => (ms == null ? "-" : f(ms));
}
