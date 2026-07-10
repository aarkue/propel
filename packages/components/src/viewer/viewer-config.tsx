import { type ComponentType, createContext, type ReactNode, useCallback, useContext, useMemo } from "react";
import type { DfgLayoutFn } from "../dfg/DfgGraph";
import type { StyledGraphRenderer } from "../graph-svg/styled-graph";
import type { DeclareLayoutFn } from "../oc-declare/layout-util";
import type { PetriLayoutFn } from "../petri/editor/helpers/layout-graph";

/**
 * A layout engine for graph viewers: one layout fn per surface, plus `renderSvg` for image export.
 * The core ships no engine, so import a prebuilt bundle (`elkLayout` from `@r4pm/components/elk-layout`
 * or `wasmLayout` from `@r4pm/components/rust-layout/wasm`) and pass the whole object through
 * `ViewerConfigProvider`; a viewer's `layoutOverride`/`renderSvg` props still win. Any omitted surface
 * falls back to the engine-agnostic no-op. Advanced hosts can build one with `createRustLayout(transport)`.
 */
export interface LayoutEngine {
  dfg?: DfgLayoutFn;
  ocdfg?: DfgLayoutFn;
  declare?: DeclareLayoutFn;
  petri?: PetriLayoutFn;
  renderSvg?: StyledGraphRenderer;
}

/** A domain element a host can act on. `scope` is the kind ("activity", "objectType", ...). */
export interface ViewerTarget {
  scope: string;
  key: string;
  data?: unknown;
}

export type ColorResolver = (scope: string, key: string) => string | undefined;

// Tuned so typical activity/object-type names spread to distinct colors instead of clustering.
const HASH_SEED = 0x0101cedc;

function hashStr(s: string): number {
  let h = HASH_SEED;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const gammaEncode = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const toByteHex = (x: number) =>
  Math.max(0, Math.min(255, Math.round(x * 255)))
    .toString(16)
    .padStart(2, "0");

// OKLCH -> sRGB hex (Ottosson). OKLCH is perceptually uniform so colors spread evenly; hex output
// keeps shadeHex/softBadgeStyle working. Out-of-gamut channels clamp.
function oklchToHex(L: number, C: number, hueDeg: number): string {
  const hr = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = gammaEncode(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_);
  const g = gammaEncode(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_);
  const bl = gammaEncode(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_);
  return `#${toByteHex(r)}${toByteHex(g)}${toByteHex(bl)}`;
}

const L_TIERS = [0.62, 0.7, 0.55];
const C_TIERS = [0.15, 0.11];

/** Deterministic hex color for a seed string; used when no host `colorOf` is set. */
export function colorForSeed(seed: string): string {
  let h = hashStr(seed);
  // Avalanche so seeds differing only in their last char don't collapse to the same color.
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  h >>>= 0;
  return oklchToHex(L_TIERS[(h >>> 9) % 3], C_TIERS[(h >>> 12) % 2], h % 360);
}

export const colorForKey: ColorResolver = (scope, key) => colorForSeed(`${scope}:${key}`);

export type AlignmentStyle = "trace" | "deviation";

export interface ViewerFormat {
  number?: (n: number) => string;
  date?: (ms: number) => string;
  duration?: (ms: number) => string;
}

export interface ViewerAction {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number }>;
  /** Limit to a target scope (e.g. only "activity"); undefined = any element. */
  scope?: string;
  run: (target: ViewerTarget) => void;
}

/**
 * Cross-cutting viewer configuration + interactivity. A host sets it via `ViewerConfigProvider`;
 * `ViewerProps` may override any field; unset fields fall back to viewer defaults.
 */
export interface ViewerConfig {
  colorOf?: ColorResolver;
  format?: ViewerFormat;
  alignmentStyle?: AlignmentStyle;
  actions?: ViewerAction[];
  onSelect?: (target: ViewerTarget) => void;
  onElementContextMenu?: (target: ViewerTarget, event: { clientX: number; clientY: number }) => void;
  /** Layout engine for graph viewers; explicit `layoutOverride`/`renderSvg` props still win. */
  layout?: LayoutEngine;
}

export interface ViewerProps<T> extends ViewerConfig {
  data: T;
  /** Source object handle id, for drill-down. */
  handle?: string;
}

const ViewerConfigContext = createContext<ViewerConfig>({});

export function ViewerConfigProvider({ value, children }: { value: ViewerConfig; children: ReactNode }) {
  return <ViewerConfigContext.Provider value={value}>{children}</ViewerConfigContext.Provider>;
}

/** Effective config inside a viewer: explicit prop wins, else provider, else defaults. `format`
 *  merges field-by-field. */
export function useViewerConfig(props: ViewerConfig): ViewerConfig {
  const ctx = useContext(ViewerConfigContext);
  return useMemo(
    () => ({
      colorOf: props.colorOf ?? ctx.colorOf ?? colorForKey,
      actions: props.actions ?? ctx.actions,
      onSelect: props.onSelect ?? ctx.onSelect,
      onElementContextMenu: props.onElementContextMenu ?? ctx.onElementContextMenu,
      format: { ...ctx.format, ...props.format },
      alignmentStyle: props.alignmentStyle ?? ctx.alignmentStyle,
      layout: props.layout ?? ctx.layout,
    }),
    [
      ctx,
      props.colorOf,
      props.actions,
      props.onSelect,
      props.onElementContextMenu,
      props.format,
      props.alignmentStyle,
      props.layout,
    ],
  );
}

/** Scope-bound color resolver from the ambient `ViewerConfig`, falling back to the seed color. */
export function useColorOf(scope: string): (key: string) => string {
  const ctx = useContext(ViewerConfigContext);
  const resolve = ctx.colorOf ?? colorForKey;
  return useCallback(
    (key: string) => resolve(scope, key) ?? colorForSeed(`${scope}:${key}`),
    [resolve, scope],
  );
}
