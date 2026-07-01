import type { CSSProperties } from "react";

export const COLORS = [
  "amber",
  "blue",
  "crimson",
  "cyan",
  "green",
  "indigo",
  "iris",
  "jade",
  "lime",
  "mint",
  "orange",
  "pink",
  "plum",
  "purple",
  "red",
  "ruby",
  "sky",
  "teal",
  "tomato",
  "violet",
  "yellow",
  "gold",
] as const;

export const COLORS_MAP: Record<(typeof COLORS)[number], string> = {
  amber: "#ffba18",
  blue: "#0588f0",
  crimson: "#df3478",
  cyan: "#0797b9",
  gold: "#8c7a5e",
  green: "#2b9a66",
  indigo: "#3358d4",
  iris: "#5151cd",
  jade: "#26997b",
  lime: "#b0e64c",
  mint: "#7de0cb",
  orange: "#ef5f00",
  pink: "#cf3897",
  plum: "#a144af",
  purple: "#8347b9",
  red: "#dc3e42",
  ruby: "#dc3b5d",
  sky: "#74daf8",
  teal: "#0d9b8a",
  tomato: "#dd4425",
  violet: "#654dc4",
  yellow: "#ffdc00",
};
export const FOREGROUND_COLORS_MAP: Record<(typeof COLORS)[number], string> = {
  amber: "#ab6400",
  blue: "#0d74ce",
  crimson: "#cb1d63",
  cyan: "#107d98",
  gold: "#71624b",
  green: "#218358",
  indigo: "#3a5bc7",
  iris: "#5753c6",
  jade: "#208368",
  lime: "#5c7c2f",
  mint: "#027864",
  orange: "#cc4e00",
  pink: "#c2298a",
  plum: "#953ea3",
  purple: "#8145b5",
  red: "#ce2c31",
  ruby: "#ca244d",
  sky: "#00749e",
  teal: "#008573",
  tomato: "#d13415",
  violet: "#6550b9",
  yellow: "#9e6c00",
};
export const LIGHT_COLORS_MAP: Record<(typeof COLORS)[number], string> = {
  amber: "#f3d673",
  blue: "#acd8fc",
  crimson: "#f3bed1",
  cyan: "#9ddde7",
  gold: "#d8d0bf",
  green: "#adddc0",
  indigo: "#c1d0ff",
  iris: "#cbcdff",
  jade: "#acdec8",
  lime: "#c2da91",
  mint: "#9ce0d0",
  orange: "#ffc182",
  pink: "#efbfdd",
  plum: "#e9c2ec",
  purple: "#e0c4f4",
  red: "#fdbdbe",
  ruby: "#f8bfc8",
  sky: "#a9daed",
  teal: "#a1ded2",
  tomato: "#fdbdaf",
  violet: "#d4cafe",
  yellow: "#f3d768",
};
export type ThemeColor = (typeof COLORS)[number];

export function colorToHex(color: ThemeColor, mode: "normal" | "foreground" | "light" = "normal"): string {
  if (mode === "normal") {
    return COLORS_MAP[color];
  }
  if (mode === "foreground") {
    return FOREGROUND_COLORS_MAP[color];
  }

  if (mode === "light") {
    return LIGHT_COLORS_MAP[color];
  }

  return COLORS_MAP[color];
}

function hexTriple(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((x) => clampByte(x).toString(16).padStart(2, "0")).join("")}`;

/** Derive a darker ("foreground", for text/borders) or lighter ("light", for fills) shade from a
 *  hex, so one shared hex color still has the fill/text variants the viewers need. */
export function shadeHex(hex: string, mode: "normal" | "foreground" | "light" = "normal"): string {
  if (mode === "normal" || hex[0] !== "#" || hex.length < 7) return hex;
  const [r, g, b] = hexTriple(hex);
  if (mode === "foreground") return `color-mix(in srgb, ${hex} 75%, CanvasText)`;
  return toHex(r + (255 - r) * 0.8, g + (255 - g) * 0.8, b + (255 - b) * 0.8);
}

/** Soft-badge styling from a hex. Uses color-mix with CSS system colors so the tint and text
 *  automatically adapt to light and dark mode without class detection. */
export function softBadgeStyle(hex: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, ${hex} 18%, Canvas)`,
    color: `color-mix(in srgb, ${hex} 75%, CanvasText)`,
  };
}
