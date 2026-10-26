import type { CSSProperties } from "react";
import { flattenColor } from "../../../dfg/util/colors";
import type { ElementStyle, StyleOverrides } from "../../../viz/types";

const px = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : Number.NaN;
  return Number.isFinite(n) ? n : undefined;
};

const color = (v: unknown): string | undefined =>
  typeof v === "string" && v !== "" ? flattenColor(v) : undefined;

/** The parts of a node's inline style rust4pm's drawing can take over: background as fill, border
 *  color and width as stroke, and opacity. */
export function cssToElementStyle(style: CSSProperties | undefined): ElementStyle | undefined {
  if (!style) return undefined;
  const out: ElementStyle = {
    fill: color(style.backgroundColor ?? style.background),
    stroke: color(style.borderColor),
    stroke_width: px(style.borderWidth),
    opacity: px(style.opacity),
  };
  const set = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as ElementStyle;
  return Object.keys(set).length > 0 ? set : undefined;
}

/** Node overrides from each graph node's on-screen style. `styleOf(i)` is the style of graph node `i`. */
export function nodeStyleOverrides(
  count: number,
  styleOf: (index: number) => CSSProperties | undefined,
): StyleOverrides {
  const nodes: Record<number, ElementStyle> = {};
  for (let i = 0; i < count; i++) {
    const style = cssToElementStyle(styleOf(i));
    if (style) nodes[i] = style;
  }
  return { nodes };
}
