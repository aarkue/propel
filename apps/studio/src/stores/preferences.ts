import { create } from "zustand";
import { colorForKey, colorForSeed } from "@r4pm/components";
import type { AlignmentStyle, ColorResolver, ViewerFormat } from "@r4pm/components";

export type DurationStyle = "short" | "long";
export type { AlignmentStyle };

/**
 * Cross-cutting display preferences consumed by every viewer (via the shell's `ViewerConfigProvider`):
 * a stable, optionally user-overridden color per domain key (activity / object type), and value
 * formatting. Persisted to localStorage. The studio builds `colorOf` / `format` from this store.
 */
export interface PreferencesState {
  /** User overrides keyed `"scope:key"` -> CSS color (e.g. "activity:pay" -> "#4f46e5"). */
  colorOverrides: Record<string, string>;
  /**
   * Every `(scope, key)` a viewer has resolved a color for this session, keyed `"scope:key"`. Lets
   * the preferences editor list all encountered activities / object types (with their current
   * auto-assigned or overridden color), not only the overridden ones. In-memory only (NOT persisted)
   * so it cannot grow unbounded across many loaded datasets; only `colorOverrides` is saved.
   */
  knownColorKeys: Record<string, true>;
  durationStyle: DurationStyle;
  /** Which alignment strip style the alignment viewers render (trace strip vs deviation strip). */
  alignmentStyle: AlignmentStyle;
  /**
   * Surface advanced/internal import kinds (e.g. raw OCEL, IndexLinkedOCEL, activity projections).
   * Off by default: most users should import the curated representation (SlimLinkedOCEL / EventLog),
   * which keeps the import menu and ambiguity picker simple and hard to misuse.
   */
  showExpertKinds: boolean;
  setColor: (scope: string, key: string, color: string) => void;
  clearColor: (scope: string, key: string) => void;
  setDurationStyle: (s: DurationStyle) => void;
  setAlignmentStyle: (s: AlignmentStyle) => void;
  setShowExpertKinds: (v: boolean) => void;
  /** Merge a batch of seen `(scope, key)` pairs into `knownColorKeys` (no-op if all already known). */
  mergeKnownColorKeys: (pairs: ReadonlyArray<[string, string]>) => void;
}

const STORAGE_KEY = "propel-preferences";

function load(): Pick<
  PreferencesState,
  "colorOverrides" | "durationStyle" | "alignmentStyle" | "showExpertKinds"
> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      colorOverrides: raw.colorOverrides ?? {},
      durationStyle: raw.durationStyle === "long" ? "long" : "short",
      alignmentStyle: raw.alignmentStyle === "deviation" ? "deviation" : "trace",
      showExpertKinds: raw.showExpertKinds === true,
    };
  } catch {
    return {
      colorOverrides: {},
      durationStyle: "short",
      alignmentStyle: "trace",
      showExpertKinds: false,
    };
  }
}

function persist(s: PreferencesState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        colorOverrides: s.colorOverrides,
        durationStyle: s.durationStyle,
        alignmentStyle: s.alignmentStyle,
        showExpertKinds: s.showExpertKinds,
      }),
    );
  } catch {
    // storage unavailable; preferences stay in-memory.
  }
}

export const usePreferences = create<PreferencesState>((set, get) => ({
  ...load(),
  knownColorKeys: {},
  setColor: (scope, key, color) => {
    set((s) => ({ colorOverrides: { ...s.colorOverrides, [`${scope}:${key}`]: color } }));
    persist(get());
  },
  clearColor: (scope, key) => {
    set((s) => {
      const next = { ...s.colorOverrides };
      delete next[`${scope}:${key}`];
      return { colorOverrides: next };
    });
    persist(get());
  },
  setDurationStyle: (durationStyle) => {
    set({ durationStyle });
    persist(get());
  },
  setAlignmentStyle: (alignmentStyle) => {
    set({ alignmentStyle });
    persist(get());
  },
  setShowExpertKinds: (showExpertKinds) => {
    set({ showExpertKinds });
    persist(get());
  },
  mergeKnownColorKeys: (pairs) => {
    let changed = false;
    const next = { ...get().knownColorKeys };
    for (const [scope, key] of pairs) {
      const k = `${scope}:${key}`;
      if (!next[k]) {
        next[k] = true;
        changed = true;
      }
    }
    if (!changed) return;
    set({ knownColorKeys: next });
  },
}));

// Batch color-key registration: viewers resolve colors during render, so flush store updates on a
// microtask to avoid setState-during-render. Dedupe within a batch; the store no-ops if all known.
let pendingKeys: Array<[string, string]> = [];
let flushScheduled = false;

/** Record that a `(scope, key)` was seen, so the preferences editor can list it. Batched. */
export function registerColorKey(scope: string, key: string): void {
  pendingKeys.push([scope, key]);
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    const batch = pendingKeys;
    pendingKeys = [];
    usePreferences.getState().mergeKnownColorKeys(batch);
  });
}

/**
 * Advanced/internal import kinds hidden unless `showExpertKinds` is on. The curated alternatives
 * (SlimLinkedOCEL for OCEL data, EventLog for logs) cover these, so hiding them removes ambiguous
 * import choices without losing capability.
 */
export const EXPERT_IMPORT_KINDS: readonly string[] = [
  "OCEL",
  "IndexLinkedOCEL",
  "EventLogActivityProjection",
];

/**
 * Per-kind import formats hidden unless `showExpertKinds` is on, so each extension maps to one
 * curated kind. `.json` is OCEL data (-> SlimLinkedOCEL), not the rarely-used EventLog JSON
 * serialization; keep EventLog to its XES formats. Ideally also removed upstream in the engine.
 */
export const EXPERT_IMPORT_FORMATS: Record<string, readonly string[]> = {
  EventLog: ["json"],
};

/** @deprecated Use `colorForSeed` from `@r4pm/components`. */
export const stableColor = colorForSeed;

export function makeColorResolver(overrides: Record<string, string>): ColorResolver {
  return (scope, key) => overrides[`${scope}:${key}`] ?? colorForKey(scope, key);
}

function formatDuration(ms: number, style: DurationStyle): string {
  if (!Number.isFinite(ms)) return "-";
  if (Math.abs(ms) < 1000) {
    const n = Math.round(ms);
    return style === "short" ? `${n}ms` : `${n} milliseconds`;
  }
  const units: [string, string, number][] = [
    ["d", " days", 86_400_000],
    ["h", " hours", 3_600_000],
    ["m", " minutes", 60_000],
    ["s", " seconds", 1000],
  ];
  let rest = Math.abs(Math.round(ms));
  const parts: string[] = [];
  for (const [short, long, size] of units) {
    if (rest < size && parts.length === 0 && size > 1000) continue;
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n > 0) parts.push(style === "short" ? `${n}${short}` : `${n}${long}`);
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(" ") : style === "short" ? "0s" : "0 seconds";
}

export function makeFormat(opts: { durationStyle: DurationStyle }): ViewerFormat {
  return {
    number: (n) => n.toLocaleString("en"),
    duration: (ms) => formatDuration(ms, opts.durationStyle),
  };
}
