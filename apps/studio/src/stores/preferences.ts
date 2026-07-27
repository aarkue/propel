import { create } from "zustand";
import { colorForKey, colorForSeed } from "@r4pm/components";
import type { AlignmentStyle, ColorResolver, ViewerFormat } from "@r4pm/components";

export type DurationStyle = "short" | "long";
export type { AlignmentStyle };

/** Which graph layout engine the DFG / OC-DFG / Petri / OC-declare viewers use. `rust` is the default
 *  (tuned orthogonal routing, stable drag-relayout); `elk` is the legacy elkjs alternative. */
export type LayoutEngine = "rust" | "elk";

/** DFG / OC-DFG edge routing style (Rust engine only). `diagonal` is the default: flowing edges;
 *  `orthogonal` is straight vertical channels with L-bends (ELK-like). */
export type DfgRouting = "orthogonal" | "diagonal";

/** Cross-cutting display preferences consumed by every viewer via the shell's `ViewerConfigProvider`; persisted to localStorage. */
export interface PreferencesState {
  /** User overrides keyed `"scope:key"` -> CSS color (e.g. "activity:pay" -> "#4f46e5"). */
  colorOverrides: Record<string, string>;
  /** Every `(scope, key)` a viewer has resolved a color for this session, keyed `"scope:key"`. In-memory only, not persisted. */
  knownColorKeys: Record<string, true>;
  durationStyle: DurationStyle;
  /** Which alignment strip style the alignment viewers render (trace strip vs deviation strip). */
  alignmentStyle: AlignmentStyle;
  /** Which graph layout engine the DFG / OC-DFG / Petri / OC-declare viewers use. */
  layoutEngine: LayoutEngine;
  /** DFG / OC-DFG edge routing style (Rust engine only). */
  dfgRouting: DfgRouting;
  /** Surface advanced/internal import kinds (raw OCEL, IndexLinkedOCEL, activity projections). Off by default to keep the import menu simple. */
  showExpertKinds: boolean;
  /** Max size (MB) of an imported dataset to cache in the browser (wasm) for session restore; larger ones relink from file instead. 0 = unlimited. */
  cacheMaxMb: number;
  setColor: (scope: string, key: string, color: string) => void;
  clearColor: (scope: string, key: string) => void;
  setDurationStyle: (s: DurationStyle) => void;
  setAlignmentStyle: (s: AlignmentStyle) => void;
  setLayoutEngine: (e: LayoutEngine) => void;
  setDfgRouting: (r: DfgRouting) => void;
  setShowExpertKinds: (v: boolean) => void;
  setCacheMaxMb: (mb: number) => void;
  /** Merge a batch of seen `(scope, key)` pairs into `knownColorKeys` (no-op if all already known). */
  mergeKnownColorKeys: (pairs: ReadonlyArray<[string, string]>) => void;
}

const STORAGE_KEY = "propel-preferences";

/** Default dataset cache cap (MB): big datasets relink on restore rather than gzipping into idb and
 *  risking an OOM spike / quota eviction. 0 (user-set) still means unlimited. */
const DEFAULT_CACHE_MAX_MB = 300;

function load(): Pick<
  PreferencesState,
  | "colorOverrides"
  | "durationStyle"
  | "alignmentStyle"
  | "layoutEngine"
  | "dfgRouting"
  | "showExpertKinds"
  | "cacheMaxMb"
> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      colorOverrides: raw.colorOverrides ?? {},
      durationStyle: raw.durationStyle === "long" ? "long" : "short",
      alignmentStyle: raw.alignmentStyle === "deviation" ? "deviation" : "trace",
      layoutEngine: raw.layoutEngine === "elk" ? "elk" : "rust",
      dfgRouting: raw.dfgRouting === "orthogonal" ? "orthogonal" : "diagonal",
      showExpertKinds: raw.showExpertKinds === true,
      cacheMaxMb:
        typeof raw.cacheMaxMb === "number" && raw.cacheMaxMb >= 0 ? raw.cacheMaxMb : DEFAULT_CACHE_MAX_MB,
    };
  } catch {
    return {
      colorOverrides: {},
      durationStyle: "short",
      alignmentStyle: "trace",
      layoutEngine: "rust",
      dfgRouting: "diagonal",
      showExpertKinds: false,
      cacheMaxMb: DEFAULT_CACHE_MAX_MB,
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
        layoutEngine: s.layoutEngine,
        dfgRouting: s.dfgRouting,
        showExpertKinds: s.showExpertKinds,
        cacheMaxMb: s.cacheMaxMb,
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
  setLayoutEngine: (layoutEngine) => {
    set({ layoutEngine });
    persist(get());
  },
  setDfgRouting: (dfgRouting) => {
    set({ dfgRouting });
    persist(get());
  },
  setShowExpertKinds: (showExpertKinds) => {
    set({ showExpertKinds });
    persist(get());
  },
  setCacheMaxMb: (cacheMaxMb) => {
    set({ cacheMaxMb: Math.max(0, cacheMaxMb) });
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

/** Advanced/internal import kinds hidden unless `showExpertKinds` is on; curated alternatives (SlimLinkedOCEL, EventLog) cover these. */
export const EXPERT_IMPORT_KINDS: readonly string[] = [
  "OCEL",
  "IndexLinkedOCEL",
  "EventLogActivityProjection",
];

/** Per-kind import formats hidden unless `showExpertKinds` is on. `.json` is OCEL data (-> SlimLinkedOCEL), not the EventLog JSON serialization. */
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
