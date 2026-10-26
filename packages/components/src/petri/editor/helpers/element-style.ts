import type { CSSProperties } from "react";
import type { ElementStyle } from "../../../viz";

// Only the set fields: an unset one must not override a default the node already has.
function css(entries: [keyof CSSProperties, string | number | null | undefined][]): CSSProperties {
  return Object.fromEntries(entries.filter(([, v]) => v != null)) as CSSProperties;
}

/** On-screen CSS of a place or transition's {@link ElementStyle}. */
export function nodeStyleCss(style?: ElementStyle): CSSProperties {
  if (!style) return {};
  return css([
    ["backgroundColor", style.fill],
    ["borderColor", style.stroke],
    ["borderWidth", style.stroke_width],
    ["borderStyle", style.dash ? "dashed" : undefined],
    ["opacity", style.opacity],
  ]);
}

/** On-screen CSS of an arc's {@link ElementStyle}. */
export function edgeStyleCss(style?: ElementStyle): CSSProperties {
  if (!style) return {};
  return css([
    ["stroke", style.stroke],
    ["strokeWidth", style.stroke_width],
    ["strokeDasharray", style.dash],
    ["opacity", style.opacity],
  ]);
}
