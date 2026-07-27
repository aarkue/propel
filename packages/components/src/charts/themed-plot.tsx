import { useEffect, useState } from "react";
import Plot, { type PlotParams } from "react-plotly.js";
import { observeThemeChange } from "../viewer/dark-mode";

interface ThemeColors {
  font: string;
  grid: string;
  zeroline: string;
}

const FALLBACK: ThemeColors = { font: "#111827", grid: "#e5e7eb", zeroline: "#d1d5db" };

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
    grid: read("--gray-a5", FALLBACK.grid),
    zeroline: read("--gray-a7", FALLBACK.zeroline),
  };
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
  };

  return (
    <Plot
      {...rest}
      layout={{
        ...layout,
        // forced, not a default: a caller-set background would break theme inheritance
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { ...(layout?.font ?? {}), color: layout?.font?.color ?? colors.font },
        xaxis: { ...axis, ...(layout?.xaxis ?? {}) },
        yaxis: { ...axis, ...(layout?.yaxis ?? {}) },
        legend: {
          ...(layout?.legend ?? {}),
          font: { ...(layout?.legend?.font ?? {}), color: layout?.legend?.font?.color ?? colors.font },
        },
      }}
    />
  );
}
