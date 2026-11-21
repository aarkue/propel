import { create } from "zustand";
import { colorForKey, formatDuration } from "@r4pm/components";
import type { AlignmentStyle, ColorResolver, ViewerFormat } from "@r4pm/components";

export type { DurationStyle } from "@r4pm/components";
import type { DurationStyle } from "@r4pm/components";
export type { AlignmentStyle };

/** Edge routing of the process maps (DFG, OC-DFG, OCEL type graph). `diagonal` (the default) draws
 *  flowing edges, `orthogonal` straight channels with right-angle bends. */
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
  /** Edge routing of the process maps, passed to viewers as `ViewerConfig.routing`. */
  dfgRouting: DfgRouting;
  /** Surface advanced/internal import kinds (raw OCEL, IndexLinkedOCEL, activity projections). Off by default to keep the import menu simple. */
  showExpertKinds: boolean;
  /** Max size (MB) of an imported dataset to cache in the browser (wasm) for session restore; larger ones relink from file instead. 0 = unlimited. */
  cacheMaxMb: number;
  setColor: (scope: string, key: string, color: string) => void;
  clearColor: (scope: string, key: string) => void;
  setDurationStyle: (s: DurationStyle) => void;
  setAlignmentStyle: (s: AlignmentStyle) => void;
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
  "colorOverrides" | "durationStyle" | "alignmentStyle" | "dfgRouting" | "showExpertKinds" | "cacheMaxMb"
> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      colorOverrides: raw.colorOverrides ?? {},
      durationStyle: raw.durationStyle === "long" ? "long" : "short",
      alignmentStyle: raw.alignmentStyle === "deviation" ? "deviation" : "trace",
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

/** Per-kind import formats hidden unless `showExpertKinds` is on. `.json` is OCEL data (-> SlimLinkedOCEL), not the EventLog JSON serialization, and `.xes` is an event log, not an OCEL. */
export const EXPERT_IMPORT_FORMATS: Record<string, readonly string[]> = {
  EventLog: ["json"],
  SlimLinkedOCEL: ["xes", "xes.gz"],
};

export function makeColorResolver(overrides: Record<string, string>): ColorResolver {
  return (scope, key) => overrides[`${scope}:${key}`] ?? colorForKey(scope, key);
}

export function makeFormat(opts: { durationStyle: DurationStyle }): ViewerFormat {
  return {
    number: (n) => n.toLocaleString("en"),
    duration: (ms) => formatDuration(ms, opts.durationStyle),
  };
}
