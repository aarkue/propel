import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import PlotImport, { type PlotParams } from "react-plotly.js";
import { observeThemeChange } from "../viewer/dark-mode";

/** `react-plotly.js` is CommonJS. Bundlers apply Node ESM interop to this package's built `.js`
 *  (it is `"type": "module"`), so the default import arrives as `module.exports`, not the component. */
const Plot = ((PlotImport as { default?: unknown }).default ?? PlotImport) as ComponentType<PlotParams>;

interface ThemeColors {
  font: string;
  muted: string;
  grid: string;
  zeroline: string;
  surface: string;
  border: string;
  family: string;
}

const FALLBACK: ThemeColors = {
  font: "#111827",
  muted: "#6b7280",
  grid: "#e5e7eb",
  zeroline: "#d1d5db",
  surface: "#ffffff",
  border: "#d1d5db",
  family: "system-ui, sans-serif",
};

/** Plotly's tinycolor only understands hex/rgb()/named colors, not Radix's display-p3 or CSS vars; round-tripping through a canvas fillStyle converts or falls back. */
function toPlotlyColor(css: string, fallback: string): string {
  if (!css) return fallback;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return fallback;
  ctx.fillStyle = fallback;
  ctx.fillStyle = css;
  return String(ctx.fillStyle);
}

/** Resolve theme-dependent colors from the live Radix tokens so charts match light/dark. */
function readThemeColors(): ThemeColors {
  if (typeof document === "undefined") return FALLBACK;
  const probe = document.querySelector(".radix-themes") ?? document.body;
  const cs = getComputedStyle(probe);
  const read = (name: string, fallback: string) => toPlotlyColor(cs.getPropertyValue(name).trim(), fallback);
  return {
    font: read("--gray-12", FALLBACK.font),
    muted: read("--gray-10", FALLBACK.muted),
    grid: read("--gray-a4", FALLBACK.grid),
    zeroline: read("--gray-a6", FALLBACK.zeroline),
    surface: read("--color-panel-solid", FALLBACK.surface),
    border: read("--gray-a6", FALLBACK.border),
    family: cs.getPropertyValue("--default-font-family").trim() || FALLBACK.family,
  };
}

/** Live colors of Radix tokens (e.g., `--accent-9`) in a form Plotly accepts, updated on theme
 *  changes. `names` must be stable (a module constant). */
export function usePlotColors<K extends string>(names: Record<K, string>): Record<K, string> {
  const read = () => {
    const out = {} as Record<K, string>;
    if (typeof document === "undefined") return out;
    const cs = getComputedStyle(document.querySelector(".radix-themes") ?? document.body);
    for (const k of Object.keys(names) as K[])
      out[k] = toPlotlyColor(cs.getPropertyValue(names[k]).trim(), "#888888");
    return out;
  };
  const [colors, setColors] = useState(read);
  // biome-ignore lint/correctness/useExhaustiveDependencies: names is a module constant
  useEffect(() => {
    setColors(read());
    return observeThemeChange(() => setColors(read()));
  }, []);
  return colors;
}

type Axis = NonNullable<PlotParams["layout"]["xaxis"]>;

/** A caller's axis over the themed one; a string title keeps the themed title font. */
function mergeAxis(base: Axis, own: Axis | undefined): Axis {
  if (!own) return base;
  const baseTitle = (base.title ?? {}) as { font?: object };
  const ownTitle: { text?: string; font?: object } | undefined =
    typeof own.title === "string" ? { text: own.title } : (own.title as { font?: object } | undefined);
  const title = ownTitle
    ? { ...baseTitle, ...ownTitle, font: { ...baseTitle.font, ...ownTitle.font } }
    : baseTitle;
  return { ...base, ...own, title } as Axis;
}

/** Drop-in replacement for react-plotly.js's Plot with theme-aware background/font/grid colors from Radix; overridable via `layout`. */
export function ThemedPlot({ layout, ...rest }: PlotParams) {
  const [colors, setColors] = useState(readThemeColors);
  useEffect(() => {
    const unobserve = observeThemeChange(() => setColors(readThemeColors()));
    setColors(readThemeColors());
    return unobserve;
  }, []);

  const axis = {
    gridcolor: colors.grid,
    zerolinecolor: colors.zeroline,
    linecolor: colors.grid,
    tickfont: { size: 11, color: colors.muted },
    title: { font: { size: 12, color: colors.muted } },
  };

  return (
    <Plot
      {...rest}
      layout={{
        ...layout,
        // forced, not a default: a caller-set background would break theme inheritance
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: {
          family: colors.family,
          size: 12,
          ...(layout?.font ?? {}),
          color: layout?.font?.color ?? colors.font,
        },
        hoverlabel: {
          bgcolor: colors.surface,
          bordercolor: colors.border,
          font: { family: colors.family, size: 12, color: colors.font },
          ...(layout?.hoverlabel ?? {}),
        },
        xaxis: mergeAxis(axis, layout?.xaxis),
        yaxis: mergeAxis(axis, layout?.yaxis),
        legend: {
          ...(layout?.legend ?? {}),
          font: { ...(layout?.legend?.font ?? {}), color: layout?.legend?.font?.color ?? colors.font },
        },
      }}
    />
  );
}
