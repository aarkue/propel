import { useEffect, useState } from "react";
import Plot, { type PlotParams } from "react-plotly.js";

/** Resolve theme-dependent colors from the live Radix tokens so charts match light/dark. */
function readThemeColors(): { font: string } {
  if (typeof document === "undefined") return { font: "#111827" };
  const probe = document.querySelector(".radix-themes") ?? document.body;
  const font = getComputedStyle(probe).getPropertyValue("--gray-12").trim();
  return { font: font || "#111827" };
}

/**
 * Drop-in replacement for `react-plotly.js`'s `Plot` that makes the chart THEME-AWARE: transparent
 * paper/plot backgrounds (so it inherits the panel/Radix background in light AND dark mode) and a
 * font color from the current Radix gray scale. Re-reads on appearance change. Plotly otherwise
 * defaults to a white background, which looks broken under the dark theme.
 */
export function ThemedPlot({ layout, ...rest }: PlotParams) {
  const [colors, setColors] = useState(readThemeColors);
  useEffect(() => {
    const el = document.querySelector(".radix-themes");
    if (!el) return;
    const obs = new MutationObserver(() => setColors(readThemeColors()));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return (
    <Plot
      {...rest}
      layout={{
        ...layout,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: colors.font, ...(layout?.font ?? {}) },
      }}
    />
  );
}
